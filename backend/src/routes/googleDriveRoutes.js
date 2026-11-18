import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import GoogleDriveConnection from "../models/GoogleDriveConnection.js";
import GoogleDriveOAuthState from "../models/GoogleDriveOAuthState.js";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";
import { googleFetch } from "../utils/googleFetch.js";
import { encryptGoogleToken } from "../utils/googleTokenEncryption.js";
import { consumeGoogleDriveOAuthState } from "../services/googleDriveOAuthStateService.js";

const router = express.Router();
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const CONNECTION_KEY = "company_document_storage";

const getDriveOAuthConfig = () => {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REDIRECT_URI, JWT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_DRIVE_REDIRECT_URI) {
        throw new Error("Google Drive OAuth environment variables are not configured");
    }
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
        throw new Error("JWT_SECRET is not configured correctly");
    }
    return {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        redirectUri: GOOGLE_DRIVE_REDIRECT_URI,
        jwtSecret: JWT_SECRET
    };
};

const validateInitiatingAdmin = async (decoded) => {
    if (!mongoose.isValidObjectId(decoded.userId)) return false;

    const user = await User.findById(decoded.userId)
        .select("_id employee role isActive tokenVersion");
    const session = await Session.findOne({
        user: decoded.userId,
        jti: decoded.sessionJti,
        tokenVersion: decoded.tokenVersion,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    }).select("_id");

    if (!user || !user.isActive || user.role !== "admin" ||
        (user.tokenVersion ?? 0) !== (decoded.tokenVersion ?? 0) || !session) {
        return false;
    }

    return Boolean(await Employee.exists({
        _id: user.employee,
        employmentStatus: "active"
    }));
};

// Company-wide Drive storage is deliberately Admin-only and separate from Gmail.
router.get("/drive/connect", protect, authorizeRoles("admin"), async (req, res) => {
    try {
        const config = getDriveOAuthConfig();
        if (!req.user.sessionJti) {
            return res.status(401).json({ success: false, message: "An active login session is required" });
        }

        const nonce = crypto.randomUUID();
        await GoogleDriveOAuthState.create({
            nonce,
            userId: req.user.userId,
            sessionJti: req.user.sessionJti,
            tokenVersion: req.user.tokenVersion ?? 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        const state = jwt.sign({
            userId: req.user.userId,
            purpose: "google-drive-oauth",
            nonce,
            sessionJti: req.user.sessionJti,
            tokenVersion: req.user.tokenVersion ?? 0
        }, config.jwtSecret, {
            algorithm: "HS256",
            expiresIn: "10m",
            issuer: "hrms",
            audience: "google-drive-oauth"
        });

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: "code",
            scope: `openid email profile ${DRIVE_FILE_SCOPE}`,
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
            state
        });

        return res.status(200).json({
            success: true,
            authorizationUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`
        });
    } catch (error) {
        console.error("Google Drive connect initialization failed:", error.message);
        return res.status(503).json({ success: false, message: "Google Drive connection is not configured" });
    }
});

router.get("/drive/callback", async (req, res) => {
    try {
        const config = getDriveOAuthConfig();
        const { code, state, error: googleError } = req.query;
        if (typeof state !== "string") {
            return res.status(400).json({ success: false, message: "Missing Google Drive OAuth state" });
        }

        const decoded = jwt.verify(state, config.jwtSecret, {
            algorithms: ["HS256"],
            issuer: "hrms",
            audience: "google-drive-oauth"
        });
        if (decoded.purpose !== "google-drive-oauth" || !decoded.userId ||
            typeof decoded.nonce !== "string" || !decoded.nonce ||
            typeof decoded.sessionJti !== "string" || !decoded.sessionJti) {
            return res.status(400).json({ success: false, message: "Invalid Google Drive OAuth state" });
        }

        const consumed = await consumeGoogleDriveOAuthState({
            nonce: decoded.nonce,
            userId: decoded.userId,
            sessionJti: decoded.sessionJti,
            tokenVersion: decoded.tokenVersion ?? 0
        });
        if (!consumed) {
            return res.status(400).json({ success: false, message: "Google Drive OAuth state is invalid, expired, or already used" });
        }

        if (googleError) {
            const safeError = typeof googleError === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(googleError)
                ? googleError : "unknown_error";
            console.error("Google Drive authorization returned an error:", safeError);
            return res.status(400).json({ success: false, message: `Google Drive authorization was not completed (${safeError})` });
        }
        if (typeof code !== "string" || !code) {
            return res.status(400).json({ success: false, message: "Missing Google Drive authorization code" });
        }

        if (!await validateInitiatingAdmin(decoded)) {
            return res.status(403).json({
                success: false,
                message: "An active Admin session is required to connect company Google Drive"
            });
        }

        const tokenResponse = await googleFetch(GOOGLE_TOKEN_URL, {
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
        const tokens = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokens.access_token) {
            console.error("Google Drive token exchange failed:", tokens.error || tokenResponse.status);
            return res.status(502).json({ success: false, message: "Google Drive token exchange failed" });
        }

        const profileResponse = await googleFetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const profile = await profileResponse.json().catch(() => ({}));
        if (!profileResponse.ok || typeof profile.email !== "string" || profile.email_verified !== true) {
            console.error("Google Drive account identity verification failed:", profileResponse.status);
            return res.status(502).json({ success: false, message: "Could not verify the Google account email" });
        }

        const grantedScopes = typeof tokens.scope === "string"
            ? tokens.scope.split(" ").filter(Boolean)
            : [];
        if (grantedScopes.length && !grantedScopes.includes(DRIVE_FILE_SCOPE)) {
            return res.status(403).json({
                success: false,
                message: "Google did not grant the required Google Drive file access permission"
            });
        }

        const existing = await GoogleDriveConnection.findOne({ connectionKey: CONNECTION_KEY })
            .select("+refreshTokenEncrypted");
        // A refresh token belongs to one Google account. Never carry it over
        // when an administrator switches the company storage account.
        const sameGoogleAccount = existing?.googleEmail === profile.email.toLowerCase();
        const refreshTokenEncrypted = tokens.refresh_token
            ? encryptGoogleToken(tokens.refresh_token)
            : sameGoogleAccount ? existing?.refreshTokenEncrypted : null;

        if (!refreshTokenEncrypted) {
            return res.status(502).json({
                success: false,
                message: "Google did not return a refresh token. Re-authorize company Drive with consent."
            });
        }

        await GoogleDriveConnection.findOneAndUpdate(
            { connectionKey: CONNECTION_KEY },
            {
                $set: {
                    googleEmail: profile.email.toLowerCase(),
                    accessTokenEncrypted: encryptGoogleToken(tokens.access_token),
                    refreshTokenEncrypted,
                    tokenExpiresAt: tokens.expires_in
                        ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
                        : null,
                    scopes: grantedScopes.length ? grantedScopes : [DRIVE_FILE_SCOPE],
                    connectedBy: decoded.userId,
                    connectedAt: new Date()
                }
            },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );

        const clientUrl = (process.env.CLIENT_URL || "").split(",")[0].trim();
        if (!clientUrl) {
            return res.status(200).json({ success: true, connected: true, googleEmail: profile.email.toLowerCase() });
        }
        return res.redirect(`${clientUrl.replace(/\/$/, "")}/settings?drive_connected=1`);
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(400).json({ success: false, message: "Google Drive OAuth state is invalid or expired" });
        }
        console.error("Google Drive OAuth callback failed:", error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Google Drive connection failed"
        });
    }
});

router.get("/drive/status", protect, authorizeRoles("admin"), async (req, res) => {
    try {
        const connection = await GoogleDriveConnection.findOne({ connectionKey: CONNECTION_KEY })
            .select("googleEmail connectedAt lastUsedAt");
        return res.status(200).json({
            success: true,
            connected: Boolean(connection),
            googleEmail: connection?.googleEmail || null,
            connectedAt: connection?.connectedAt || null,
            lastUsedAt: connection?.lastUsedAt || null
        });
    } catch (error) {
        console.error("Google Drive status lookup failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not load Google Drive connection status" });
    }
});

router.delete("/drive/disconnect", protect, authorizeRoles("admin"), auditAction("integrations", "google.drive_disconnected"), async (req, res) => {
    try {
        const result = await GoogleDriveConnection.deleteOne({ connectionKey: CONNECTION_KEY });
        return res.status(200).json({
            success: true,
            disconnected: result.deletedCount > 0,
            message: result.deletedCount > 0
                ? "Company Google Drive disconnected from HRMS"
                : "No company Google Drive account was connected"
        });
    } catch (error) {
        console.error("Google Drive disconnect failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not disconnect company Google Drive" });
    }
});

export default router;
