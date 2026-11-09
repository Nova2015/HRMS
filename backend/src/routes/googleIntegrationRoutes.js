import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import GoogleGmailIntegration from "../models/GoogleGmailIntegration.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
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

export default router;
