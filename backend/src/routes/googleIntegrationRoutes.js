import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import GoogleGmailIntegration from "../models/GoogleGmailIntegration.js";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
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

        // Revalidate the initiating account because its role or active status may
        // have changed while the user was completing Google's consent screen.
        if (!mongoose.isValidObjectId(decoded.userId)) {
            return res.status(400).json({ success: false, message: "Invalid Google OAuth user" });
        }
        const initiatingUser = await User.findById(decoded.userId)
            .select("_id employee role isActive");
        if (!initiatingUser || !initiatingUser.isActive ||
            !["admin", "hr"].includes(initiatingUser.role)) {
            return res.status(403).json({
                success: false,
                message: "Your account is no longer authorized to connect Gmail"
            });
        }
        const activeEmployee = await Employee.exists({
            _id: initiatingUser.employee,
            employmentStatus: "active"
        });
        if (!activeEmployee) {
            return res.status(403).json({
                success: false,
                message: "An active employee account is required to connect Gmail"
            });
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
        return res.redirect(`${process.env.CLIENT_URL}/integrations/google-gmail?connected=1`);
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(400).json({ success: false, message: "Google OAuth state is invalid or expired" });
        }
        console.error("Google Gmail OAuth callback failed:", error.message);
        return res.status(500).json({ success: false, message: "Google Gmail connection failed" });
    }
});

// Connection status for the signed-in Admin/HR user. Never expose stored OAuth tokens.
router.get("/gmail/status", protect, authorizeRoles("admin", "hr"), async (req, res) => {
    try {
        const integration = await GoogleGmailIntegration.findOne({ userId: req.user.userId })
            .select("googleEmail connectedAt lastUsedAt");
        return res.status(200).json({
            success: true,
            connected: Boolean(integration),
            googleEmail: integration?.googleEmail || null,
            connectedAt: integration?.connectedAt || null,
            lastUsedAt: integration?.lastUsedAt || null
        });
    } catch (error) {
        console.error("Google Gmail status lookup failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not load Gmail connection status" });
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
            .select("employeeCode firstName lastName")
            .lean();

        const normalizeMatchText = (value) => String(value || "")
            .normalize("NFKC")
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .replace(/\s+/g, " ");

        // A name alone is not enough: personal alerts and marketing emails often contain an employee's name.
        // Require explicit HR/employee-record update context for full-name matches.
        const employeeUpdatePhrases = [
            "employee details", "personal details update", "update personal details",
            "update employee details", "employee information update", "employment details",
            "employee record update", "correction request", "change request for employee",
            "joining date", "reporting manager", "residential address", "permanent address",
            "current address", "emergency contact", "nominee details", "update bank account",
            "bank account update", "change bank account", "pan details update", "uan details update",
            "pf details update", "document verification", "document submission",
            "onboarding documents", "joining formalities", "appointment letter",
            "offer letter", "employee code"
        ].map(normalizeMatchText);
        const hasEmployeeUpdateContext = (value) => {
            const normalized = normalizeMatchText(value);
            return employeeUpdatePhrases.some((phrase) => normalized.includes(phrase));
        };

        const messages = [];
        for (let offset = 0; offset < ids.length; offset += 5) {
            const batch = await Promise.all(ids.slice(offset, offset + 5).map(async (messageId) => {
                const detailUrl = new URL(GMAIL_API_URL + "/messages/" + encodeURIComponent(messageId));
                detailUrl.searchParams.set("format", "full");
                const message = await gmailApiFetch(detailUrl, accessToken);
                const headers = message.payload?.headers || [];
                const header = (name) => headers.find((item) => item.name?.toLowerCase() === name)?.value || "";
                const bodyText = collectPlainText(message.payload).join("\n").trim();
                const searchableText = header("subject") + "\n" + (message.snippet || "") + "\n" + bodyText;
                const normalizedSearchText = " " + normalizeMatchText(searchableText) + " ";
                const hasUpdateContext = hasEmployeeUpdateContext(searchableText);
                const matchedEmployees = employees.flatMap((employee) => {
                    const code = String(employee.employeeCode || "").trim().toUpperCase();
                    const codePattern = code
                        ? new RegExp("(^|[^A-Z0-9])" + escapeRegex(code) + "([^A-Z0-9]|$)")
                        : null;
                    const codeMatched = Boolean(codePattern?.test(searchableText.toUpperCase()));
                    const fullName = normalizeMatchText((employee.firstName || "") + " " + (employee.lastName || ""));
                    const nameMatched = fullName.length > 2
                        && normalizedSearchText.includes(" " + fullName + " ")
                        && hasUpdateContext;
                    if (!codeMatched && !nameMatched) return [];
                    return [{
                        employeeCode: code,
                        employeeName: ((employee.firstName || "") + " " + (employee.lastName || "")).trim(),
                        matchType: codeMatched && nameMatched ? "employee_code_and_name" : codeMatched ? "employee_code" : "full_name_hr_context"
                    }];
                });
                return {
                    messageId: message.id,
                    threadId: message.threadId,
                    from: header("from"),
                    subject: header("subject"),
                    date: header("date"),
                    snippet: message.snippet || "",
                    matchedEmployeeCodes: matchedEmployees
                        .filter((employee) => employee.matchType !== "full_name")
                        .map((employee) => employee.employeeCode),
                    matchedEmployees,
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
