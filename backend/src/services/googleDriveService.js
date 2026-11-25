import crypto from "node:crypto";
import GoogleDriveConnection from "../models/GoogleDriveConnection.js";
import { decryptGoogleToken, encryptGoogleToken } from "../utils/googleTokenEncryption.js";
import { googleFetch } from "../utils/googleFetch.js";
import { runSingleFlight } from "../utils/singleFlight.js";
import { persistGoogleRefreshIfUnchanged } from "../utils/googleRefreshPersistence.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const ROOT_FOLDER_NAME = "HRMS Private Storage";
const ROOT_MARKER = "hrmsStorageRoot";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const config = () => {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        const error = new Error("Google Drive OAuth is not configured");
        error.status = 503;
        throw error;
    }
    return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET };
};

const driveError = (message, status = 502) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const driveRequest = async (url, accessToken, options = {}) => {
    const response = await googleFetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...options.headers
        }
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        // Do not return Google's raw error text; it may contain implementation details.
        console.error("Google Drive API request failed:", payload.error?.status || response.status);
        throw driveError(
            response.status === 401 ? "Google Drive authorization expired; reconnect the company account"
                : response.status === 403 ? "Google Drive access was denied; check account permissions and available storage"
                : response.status === 404 ? "Google Drive file was not found"
                : "Google Drive request failed",
            response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 404 ? 404 : 502
        );
    }
    return response;
};

const getAccessToken = async () => {
    const initial = await GoogleDriveConnection.findOne({ connectionKey: "company_document_storage" })
        .select("+accessTokenEncrypted +refreshTokenEncrypted");
    if (!initial) throw driveError("Company Google Drive is not connected", 409);

    const isFresh = initial.tokenExpiresAt && initial.tokenExpiresAt.getTime() > Date.now() + 60_000;
    if (isFresh) return decryptGoogleToken(initial.accessTokenEncrypted);

    return runSingleFlight("company_document_storage", async () => {
        const current = await GoogleDriveConnection.findById(initial._id)
            .select("+accessTokenEncrypted +refreshTokenEncrypted");
        if (!current) throw driveError("Company Google Drive connection changed; reconnect the account", 409);
        if (current.tokenExpiresAt && current.tokenExpiresAt.getTime() > Date.now() + 60_000) {
            return decryptGoogleToken(current.accessTokenEncrypted);
        }

        const credentials = config();
        const refreshToken = decryptGoogleToken(current.refreshTokenEncrypted);
        const response = await googleFetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                refresh_token: refreshToken,
                grant_type: "refresh_token"
            })
        });
        const tokens = await response.json().catch(() => ({}));
        if (!response.ok || !tokens.access_token) {
            console.error("Google Drive access-token refresh failed:", tokens.error || response.status);
            throw driveError("Google Drive authorization expired; reconnect the company account", 401);
        }

        const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000);
        const persisted = await persistGoogleRefreshIfUnchanged({
            model: GoogleDriveConnection,
            snapshot: current,
            accessTokenEncrypted: encryptGoogleToken(tokens.access_token),
            tokenExpiresAt: expiresAt
        });
        if (!persisted) {
            const latest = await GoogleDriveConnection.findById(current._id)
                .select("+accessTokenEncrypted +refreshTokenEncrypted");
            if (latest && latest.tokenExpiresAt?.getTime() > Date.now() + 60_000) {
                return decryptGoogleToken(latest.accessTokenEncrypted);
            }
            throw driveError("Google Drive connection changed during token refresh; retry the request", 409);
        }
        return tokens.access_token;
    });
};

const listRootFolder = async (accessToken) => {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='${ROOT_MARKER}' and value='true' }`);
    url.searchParams.set("fields", "files(id,name,mimeType)");
    url.searchParams.set("pageSize", "10");
    const response = await driveRequest(url, accessToken);
    const payload = await response.json();
    return payload.files?.[0] || null;
};

const ensureRootFolderOnce = async (accessToken) => {
    const connection = await GoogleDriveConnection.findOne({ connectionKey: "company_document_storage" })
        .select("+accessTokenEncrypted +refreshTokenEncrypted driveFolderId");
    if (!connection) throw driveError("Company Google Drive is not connected", 409);
    if (connection.driveFolderId) return connection.driveFolderId;

    const existing = await listRootFolder(accessToken);
    if (existing?.id) {
        await GoogleDriveConnection.updateOne(
            { _id: connection._id, driveFolderId: null },
            { $set: { driveFolderId: existing.id } }
        );
        return existing.id;
    }

    const response = await driveRequest(`${DRIVE_API}/files?fields=id,name,mimeType`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: ROOT_FOLDER_NAME,
            mimeType: "application/vnd.google-apps.folder",
            appProperties: { [ROOT_MARKER]: "true" }
        })
    });
    const folder = await response.json();
    if (!folder.id) throw driveError("Google Drive did not return the HRMS storage folder ID");
    await GoogleDriveConnection.updateOne(
        { _id: connection._id, driveFolderId: null },
        { $set: { driveFolderId: folder.id } }
    );
    return folder.id;
};

const ensureRootFolder = (accessToken) => runSingleFlight("company_drive_root_folder", () => ensureRootFolderOnce(accessToken));

const safeFileName = (value) => {
    const name = String(value || "document").replace(/[\/\\\x00-\x1f\x7f]/g, "_").trim();
    return (name || "document").slice(0, 180);
};

export const uploadCompanyDriveFile = async ({ buffer, fileName, mimeType, appProperties = {} }) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw driveError("A non-empty file buffer is required", 400);
    if (buffer.length > MAX_FILE_BYTES) throw driveError("File exceeds the 10 MB HRMS upload limit", 413);
    if (!mimeType || typeof mimeType !== "string") throw driveError("A valid file MIME type is required", 400);

    const accessToken = await getAccessToken();
    const folderId = await ensureRootFolder(accessToken);
    const boundary = `hrms_${crypto.randomBytes(12).toString("hex")}`;
    const metadata = {
        name: safeFileName(fileName),
        mimeType,
        parents: [folderId],
        appProperties: Object.fromEntries(Object.entries(appProperties).filter(([key, value]) =>
            /^[a-zA-Z0-9_]{1,124}$/.test(key) && typeof value === "string" && value.length <= 124
        ))
    };
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--`)
    ]);
    const url = new URL(`${DRIVE_UPLOAD_API}/files`);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("fields", "id,name,mimeType,size,md5Checksum,parents");
    const response = await driveRequest(url, accessToken, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
    });
    const file = await response.json();
    if (!file.id) throw driveError("Google Drive upload did not return a file ID");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    await GoogleDriveConnection.updateOne(
        { connectionKey: "company_document_storage" },
        { $set: { lastUsedAt: new Date() } }
    );
    return { id: file.id, name: file.name, mimeType: file.mimeType, size: Number(file.size || buffer.length), sha256 };
};

export const downloadCompanyDriveFile = async ({ fileId, expectedSha256, maxBytes = MAX_FILE_BYTES }) => {
    if (typeof fileId !== "string" || !/^[a-zA-Z0-9_-]{5,200}$/.test(fileId)) {
        throw driveError("A valid Google Drive file ID is required", 400);
    }
    const accessToken = await getAccessToken();
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("alt", "media");
    const response = await driveRequest(url, accessToken);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw driveError("Google Drive file exceeds the allowed download size", 413);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw driveError("Google Drive file exceeds the allowed download size", 413);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    if (expectedSha256 && sha256 !== expectedSha256) {
        throw driveError("Google Drive file checksum verification failed", 502);
    }
    await GoogleDriveConnection.updateOne(
        { connectionKey: "company_document_storage" },
        { $set: { lastUsedAt: new Date() } }
    );
    return { buffer, sha256, size: buffer.length };
};

export const findCompanyDriveFileByAppProperties = async (appProperties = {}) => {
    const entries = Object.entries(appProperties);
    if (!entries.length || entries.some(([key, value]) =>
        !/^[a-zA-Z0-9_]{1,124}$/.test(key) || typeof value !== "string" ||
        !/^[a-zA-Z0-9_-]{1,124}$/.test(value)
    )) {
        throw driveError("Valid Google Drive app properties are required", 400);
    }
    const accessToken = await getAccessToken();
    const folderId = await ensureRootFolder(accessToken);
    const clauses = [
        `'${folderId}' in parents`,
        "trashed=false",
        ...entries.map(([key, value]) =>
            `appProperties has { key='${key}' and value='${value}' }`
        )
    ];
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", clauses.join(" and "));
    url.searchParams.set("pageSize", "2");
    url.searchParams.set("orderBy", "createdTime");
    url.searchParams.set("fields", "files(id,name,mimeType,size,appProperties,createdTime)");
    const response = await driveRequest(url, accessToken);
    const payload = await response.json();
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (files.length > 1) {
        throw driveError("Multiple Google Drive files match the same HRMS record; manual review is required", 409);
    }
    return files[0] || null;
};

export const getCompanyDriveConnectionStatus = async () => {
    const connection = await GoogleDriveConnection.findOne({ connectionKey: "company_document_storage" })
        .select("googleEmail connectedAt lastUsedAt driveFolderId");
    return connection ? {
        connected: true,
        googleEmail: connection.googleEmail,
        connectedAt: connection.connectedAt,
        lastUsedAt: connection.lastUsedAt,
        folderReady: Boolean(connection.driveFolderId)
    } : { connected: false, googleEmail: null, connectedAt: null, lastUsedAt: null, folderReady: false };
};

export const __private = { getAccessToken, ensureRootFolder, safeFileName, MAX_FILE_BYTES };
