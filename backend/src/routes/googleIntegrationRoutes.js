import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import GoogleGmailIntegration from "../models/GoogleGmailIntegration.js";
import Employee from "../models/Employee.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_PROFILE_URL = `${GMAIL_API_URL}/profile`;
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const getOAuthConfig = () => {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GMAIL_REDIRECT_URI, JWT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_GMAIL_REDIRECT_URI) {
        throw new Error("Google Gmail OAuth environment variables are not configured");
    }
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
        throw new Error("JWT_SECRET is not configured correctly");
    }
    return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: GOOGLE_GMAIL_REDIRECT_URI, jwtSecret: JWT_SECRET };
};

const getEncryptionKey = () => {
    const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!encoded) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return key;
};

const encryptToken = (value) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
};

const decryptToken = (value) => {
    if (!value) throw new Error("Stored Google token is missing");
    const [ivPart, tagPart, ciphertextPart] = value.split(".");
    if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Stored Google token is invalid");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, "base64")),
        decipher.final()
    ]).toString("utf8");
};

const getGmailAccessToken = async (integration) => {
    const expiresSoon = !integration.tokenExpiresAt || integration.tokenExpiresAt.getTime() <= Date.now() + 60_000;
    if (!expiresSoon) return decryptToken(integration.accessTokenEncrypted);

    const refreshToken = decryptToken(integration.refreshTokenEncrypted);
    const config = getOAuthConfig();
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        })
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) {
        console.error("Google Gmail access-token refresh failed:", tokens.error || response.status);
        const error = new Error("Google Gmail authorization expired; reconnect the account");
        error.status = 401;
        throw error;
    }

    integration.accessTokenEncrypted = encryptToken(tokens.access_token);
    integration.tokenExpiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000);
    await integration.save();
    return tokens.access_token;
};

const gmailApiFetch = async (url, accessToken) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json();
    if (!response.ok) {
        console.error("Gmail API request failed:", payload.error?.status || response.status);
        const error = new Error("Gmail could not be read. Check Gmail API access and reconnect if needed.");
        error.status = response.status === 401 ? 401 : 502;
        throw error;
    }
    return payload;
};

const decodeMessagePart = (data) => {
    if (!data) return "";
    return Buffer.from(data, "base64url").toString("utf8");
};

const collectPlainText = (part, chunks = []) => {
    if (part?.mimeType === "text/plain" && part.body?.data) {
        chunks.push(decodeMessagePart(part.body.data));
    }
    for (const child of part?.parts || []) collectPlainText(child, chunks);
    return chunks;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/gmail/connect", protect, authorizeRoles("admin", "hr"), (req, res) => {
    try {
        const config = getOAuthConfig();
        const state = jwt.sign(
            { userId: req.user.userId, purpose: "google-gmail-oauth", nonce: crypto.randomUUID() },
            config.jwtSecret,
            { algorithm: "HS256", expiresIn: "10m", issuer: "hrms", audience: "google-gmail-oauth" }
        );
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: "code",
            scope: `openid email profile ${GMAIL_READONLY_SCOPE}`,
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
            state
        });
        return res.status(200).json({ success: true, authorizationUrl: `${GOOGLE_AUTH_URL}?${params.toString()}` });
    } catch (error) {
        return res.status(503).json({ success: false, message: error.message });
    }
});

router.get("/gmail/callback", async (req, res) => {
    try {
        const config = getOAuthConfig();
        const { code, state, error: googleError } = req.query;
        if (googleError) return res.status(400).json({ success: false, message: "Google authorization was not completed" });
        if (typeof code !== "string" || typeof state !== "string") {
            return res.status(400).json({ success: false, message: "Missing Google OAuth callback parameters" });
        }

        const decoded = jwt.verify(state, config.jwtSecret, {
            algorithms: ["HS256"],
            issuer: "hrms",
            audience: "google-gmail-oauth"
        });
        if (decoded.purpose !== "google-gmail-oauth" || !decoded.userId) {
            return res.status(400).json({ success: false, message: "Invalid Google OAuth state" });
        }

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                grant_type: "authorization_code"
            })
        });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.access_token) {
            console.error("Google OAuth token exchange failed:", tokens.error || tokenResponse.status);
            return res.status(502).json({ success: false, message: "Google token exchange failed" });
        }

        const profileResponse = await fetch(GMAIL_PROFILE_URL, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const profile = await profileResponse.json();
        if (!profileResponse.ok || typeof profile.emailAddress !== "string") {
            console.error("Google Gmail profile lookup failed:", profile.error?.status || profileResponse.status);
            return res.status(502).json({ success: false, message: "Could not verify the connected Gmail account" });
        }

        const existing = await GoogleGmailIntegration.findOne({ userId: decoded.userId }).select("+refreshTokenEncrypted");
        const update = {
            googleEmail: profile.emailAddress.toLowerCase(),
            accessTokenEncrypted: encryptToken(tokens.access_token),
            tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
            scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : [GMAIL_READONLY_SCOPE],
            connectedAt: new Date()
        };
        if (tokens.refresh_token) update.refreshTokenEncrypted = encryptToken(tokens.refresh_token);
        else if (existing?.refreshTokenEncrypted) update.refreshTokenEncrypted = existing.refreshTokenEncrypted;
        else {
            return res.status(502).json({ success: false, message: "Google did not return a refresh token; reconnect with consent" });
        }

        await GoogleGmailIntegration.findOneAndUpdate(
            { userId: decoded.userId },
            { $set: update },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        return res.status(200).json({ success: true, message: "Gmail account connected successfully", googleEmail: profile.emailAddress });
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(400).json({ success: false, message: "Google OAuth state is invalid or expired" });
        }
        console.error("Google Gmail OAuth callback failed:", error.message);
        return res.status(500).json({ success: false, message: "Google Gmail connection failed" });
    }
});

// Read-only discovery: returns recent message previews and any matching HRMS employee codes.
// This endpoint never changes Employee records or applies proposed employee updates.
router.get("/gmail/messages", protect, authorizeRoles("admin", "hr"), async (req, res) => {
    try {
        const integration = await GoogleGmailIntegration.findOne({ userId: req.user.userId })
            .select("+accessTokenEncrypted +refreshTokenEncrypted");
        if (!integration) {
            return res.status(404).json({ success: false, message: "Connect a Gmail account before reading messages" });
        }

        const query = typeof req.query.q === "string" && req.query.q.trim()
            ? req.query.q.trim().slice(0, 200)
            : "newer_than:30d";
        const requestedLimit = Number.parseInt(req.query.maxResults, 10);
        const maxResults = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
        const accessToken = await getGmailAccessToken(integration);
        const listUrl = new URL(`${GMAIL_API_URL}/messages`);
        listUrl.searchParams.set("q", query);
        listUrl.searchParams.set("maxResults", String(maxResults));

        const list = await gmailApiFetch(listUrl, accessToken);
        const ids = (list.messages || []).map((message) => message.id).filter(Boolean);
        const employees = await Employee.find({ employmentStatus: { $ne: "terminated" } })
            .select("employeeCode")
            .lean();
        const employeeCodes = employees.map((employee) => employee.employeeCode).filter(Boolean);

        const messages = [];
        for (let offset = 0; offset < ids.length; offset += 5) {
            const batch = await Promise.all(ids.slice(offset, offset + 5).map(async (messageId) => {
                const detailUrl = new URL(`${GMAIL_API_URL}/messages/${encodeURIComponent(messageId)}`);
                detailUrl.searchParams.set("format", "full");
                const message = await gmailApiFetch(detailUrl, accessToken);
                const headers = message.payload?.headers || [];
                const header = (name) => headers.find((item) => item.name?.toLowerCase() === name)?.value || "";
                const bodyText = collectPlainText(message.payload).join("\n").trim();
                const searchableText = `${header("subject")}\n${message.snippet || ""}\n${bodyText}`.toUpperCase();
                const matchedEmployeeCodes = employeeCodes.filter((code) => {
                    const pattern = new RegExp(`(^|[^A-Z0-9])${escapeRegex(code.toUpperCase())}([^A-Z0-9]|$)`);
                    return pattern.test(searchableText);
                });
                return {
                    messageId: message.id,
                    threadId: message.threadId,
                    from: header("from"),
                    subject: header("subject"),
                    date: header("date"),
                    snippet: message.snippet || "",
                    matchedEmployeeCodes,
                    textPreview: bodyText.slice(0, 4000)
                };
            }));
            messages.push(...batch);
        }

        integration.lastUsedAt = new Date();
        await integration.save();
        return res.status(200).json({
            success: true,
            googleEmail: integration.googleEmail,
            query,
            totalReturned: messages.length,
            messages
        });
    } catch (error) {
        console.error("Google Gmail message discovery failed:", error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Could not read Gmail messages"
        });
    }
});

export default router;
