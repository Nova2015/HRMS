import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import GoogleGmailIntegration from "../models/GoogleGmailIntegration.js";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import CompanyEvent from "../models/CompanyEvent.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_PROFILE_URL = `${GMAIL_API_URL}/profile`;
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
            scope: `openid email profile ${GMAIL_READONLY_SCOPE} ${GOOGLE_CALENDAR_EVENTS_SCOPE}`,
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


// Focused discovery for meetings, company events and cultural functions only.
// This endpoint is read-only: it never creates or changes Calendar records.
router.get("/gmail/calendar-candidates", protect, authorizeRoles("admin", "hr"), async (req, res) => {
    try {
        const integration = await GoogleGmailIntegration.findOne({ userId: req.user.userId })
            .select("+accessTokenEncrypted +refreshTokenEncrypted");
        if (!integration) {
            return res.status(404).json({ success: false, message: "Connect a Gmail account before scanning event emails" });
        }

        const query = 'newer_than:90d {meeting meet invite invitation agenda "calendar event" "company event" seminar workshop training conference function "annual function" "annual day" "cultural program" "cultural event" "get together" "get-together" gathering ceremony celebration inauguration "foundation day" "family day" "sports day" "office party" pooja puja prayer utsav mahotsav festival festive Diwali Deepavali Padwa "Gudi Padwa" "Gudhi Padwa" Ganeshotsav "Ganesh Chaturthi" Ganpati Holi Eid Christmas "New Year" Navratri Dussehra "Raksha Bandhan" Onam Pongal Baisakhi "Makar Sankranti" Bhaubeej "Bhai Dooj" "Lakshmi Pujan" "Independence Day" "Republic Day"} -flight -"boarding pass" -train -railway -"bus ticket" -hotel -cinema -"movie ticket" -"show ticket" -airline';
        const accessToken = await getGmailAccessToken(integration);
        const listUrl = new URL(`${GMAIL_API_URL}/messages`);
        listUrl.searchParams.set("q", query);
        listUrl.searchParams.set("maxResults", "50");
        const list = await gmailApiFetch(listUrl, accessToken);
        const ids = (list.messages || []).map((message) => message.id).filter(Boolean);
        const candidates = [];

        const classify = (value, subjectValue = "") => {
            const normalize = (input) => String(input || "").normalize("NFKC").toLocaleLowerCase()
                .replace(/[\u2010-\u2015]/g, " ").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
            const text = normalize(value);
            const subject = normalize(subjectValue);
            // Explicitly reject travel, lodging and entertainment-ticket content.
            if (/\b(flight|boarding pass|airline|train|railway|bus ticket|hotel reservation|hotel booking|movie ticket|cinema ticket|show ticket)\b/i.test(text)) return null;
            const cancellation = /\b(cancelled|canceled|cancellation|called off|postponed indefinitely)\b/i.test(text);
            const reschedule = /\b(rescheduled|reschedule|new time|time changed|date changed|updated schedule)\b/i.test(text);
            const festivalPattern = /\b(diwali|deepavali|padwa|gudi padwa|gudhi padwa|ganeshotsav|ganesh chaturthi|ganpati|holi|eid|christmas|new year|makar sankranti|navratri|dussehra|vijayadashami|raksha bandhan|onam|pongal|baisakhi|lohri|ugadi|mahashivratri|janmashtami|durga puja|eid al fitr|eid ul fitr|eid al adha|bhaubeej|bhai dooj|independence day|republic day|holi milan|eid milan|lakshmi pujan)\b/i;
            const functionPattern = /\b(function|celebration|annual day|annual function|cultural program|cultural event|get together|gathering|ceremony|company event|office event|pooja|puja|prayer|inauguration|foundation day|family day|sports day|office party|team outing|festive|utsav|mahotsav|festival|fest)\b/i;
            const meetingPattern = /\b(meeting|meet invite|invitation|agenda|conference call|webinar|calendar invite|appointment)\b/i;
            const trainingPattern = /\b(seminar|workshop|training|conference)\b/i;
            // Prefer the email subject so incidental body text cannot turn a function into a meeting.
            const category = festivalPattern.test(subject) ? "festival"
                : functionPattern.test(subject) ? "company_event"
                : trainingPattern.test(subject) ? "company_event"
                : meetingPattern.test(subject) ? "meeting"
                : festivalPattern.test(text) ? "festival"
                : functionPattern.test(text) ? "company_event"
                : trainingPattern.test(text) ? "company_event"
                : meetingPattern.test(text) ? "meeting"
                : null;
            if (!category) return null;
            return { category, action: cancellation ? "cancellation" : reschedule ? "reschedule" : category === "meeting" ? "invitation" : "event" };
        };

        for (let offset = 0; offset < ids.length; offset += 5) {
            const batch = await Promise.all(ids.slice(offset, offset + 5).map(async (messageId) => {
                const detailUrl = new URL(`${GMAIL_API_URL}/messages/${encodeURIComponent(messageId)}`);
                detailUrl.searchParams.set("format", "full");
                const message = await gmailApiFetch(detailUrl, accessToken);
                const headers = message.payload?.headers || [];
                const header = (name) => headers.find((item) => item.name?.toLowerCase() === name)?.value || "";
                const bodyText = collectPlainText(message.payload).join("\n").trim();
                const subject = header("subject");
                const classification = classify(subject + "\n" + (message.snippet || "") + "\n" + bodyText, subject);
                if (!classification) return null;
                return {
                    messageId: message.id,
                    threadId: message.threadId,
                    from: header("from"),
                    subject,
                    date: header("date"),
                    snippet: message.snippet || "",
                    textPreview: bodyText.slice(0, 3000),
                    category: classification.category,
                    detectedAction: classification.action,
                    reviewRequired: true
                };
            }));
            candidates.push(...batch.filter(Boolean));
        }

        integration.lastUsedAt = new Date();
        await integration.save();
        return res.status(200).json({
            success: true,
            query,
            totalScanned: ids.length,
            totalCandidates: candidates.length,
            candidates
        });
    } catch (error) {
        console.error("Gmail calendar candidate scan failed:", error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Could not scan Gmail event messages"
        });
    }
});


const calendarApiRequest = async (url, accessToken, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error("Google Calendar API request failed:", payload.error?.status || response.status);
        const error = new Error(payload.error?.message || "Google Calendar request failed");
        error.status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
        throw error;
    }
    return payload;
};

const toGoogleCalendarResource = (event) => {
    const resource = {
        summary: event.title,
        description: event.description || "",
        location: event.location || "",
        status: event.status === "cancelled" ? "cancelled" : "confirmed"
    };
    if (event.allDay) {
        const startDate = new Date(event.startAt).toISOString().slice(0, 10);
        let endDate = new Date(event.endAt).toISOString().slice(0, 10);
        if (endDate <= startDate) {
            const next = new Date(`${startDate}T00:00:00.000Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            endDate = next.toISOString().slice(0, 10);
        }
        resource.start = { date: startDate };
        resource.end = { date: endDate };
    } else {
        resource.start = { dateTime: new Date(event.startAt).toISOString() };
        resource.end = { dateTime: new Date(event.endAt).toISOString() };
    }
    return resource;
};

const getCalendarMapping = (event, userId) => (event.googleCalendarMappings || []).find(
    (mapping) => mapping.userId?.toString() === userId.toString() && mapping.calendarId === "primary"
);
const setCalendarMapping = (event, userId, remote) => {
    const mapping = getCalendarMapping(event, userId);
    const values = {
        userId,
        calendarId: "primary",
        googleEventId: remote.id,
        googleUpdatedAt: remote.updated ? new Date(remote.updated) : null
    };
    if (mapping) Object.assign(mapping, values);
    else event.googleCalendarMappings.push(values);
};

const inferCalendarEventType = (title, description = "") => {
    const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase()
        .replace(/[\u2010-\u2015]/g, " ").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    const titleText = normalize(title);
    const fullText = normalize(title + " " + description);
    const festivalPattern = /\b(diwali|deepavali|padwa|gudi padwa|gudhi padwa|ganeshotsav|ganesh chaturthi|ganpati|holi|eid|christmas|new year|makar sankranti|navratri|dussehra|vijayadashami|raksha bandhan|onam|pongal|baisakhi|lohri|ugadi|mahashivratri|janmashtami|durga puja|utsav|mahotsav|festival|bhaubeej|bhai dooj|independence day|republic day|holi milan|eid milan|lakshmi pujan)\b/i;
    const functionPattern = /\b(function|celebration|annual day|annual function|cultural program|cultural event|get together|gathering|ceremony|company event|office event|pooja|puja|prayer|inauguration|foundation day|family day|sports day|office party|team outing|festive|fest)\b/i;
    const trainingPattern = /\b(seminar|workshop|training|conference)\b/i;
    const meetingPattern = /\b(meeting|meet invite|invitation|agenda|conference call|webinar|calendar invite|appointment)\b/i;
    // Prefer the event title; incidental description text must not override a function/festival.
    if (festivalPattern.test(titleText) || functionPattern.test(titleText)) return "company_event";
    if (trainingPattern.test(titleText)) return "training";
    if (meetingPattern.test(titleText)) return "meeting";
    if (festivalPattern.test(fullText) || functionPattern.test(fullText)) return "company_event";
    if (trainingPattern.test(fullText)) return "training";
    if (meetingPattern.test(fullText)) return "meeting";
    return "meeting";
};

const fromGoogleCalendarResource = (remote) => {
    const allDay = Boolean(remote.start?.date);
    const startAt = allDay ? new Date(remote.start.date + "T00:00:00.000Z") : new Date(remote.start?.dateTime);
    const endAt = allDay ? new Date(remote.end?.date + "T00:00:00.000Z") : new Date(remote.end?.dateTime);
    if (!remote.id || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) return null;
    const title = String(remote.summary || "Google Calendar event").slice(0, 140);
    const description = String(remote.description || "").slice(0, 2000);
    return {
        title,
        description,
        eventType: inferCalendarEventType(title, description),
        startAt,
        endAt,
        allDay,
        location: String(remote.location || "").slice(0, 200),
        status: remote.status === "cancelled" ? "cancelled" : "scheduled"
    };
};

// Calendar connection is considered active only when the granted OAuth scopes include event access.
router.get("/calendar/status", protect, authorizeRoles("admin", "hr"), async (req, res) => {
    try {
        const integration = await GoogleGmailIntegration.findOne({ userId: req.user.userId })
            .select("googleEmail scopes connectedAt");
        const connected = Boolean(integration?.scopes?.includes(GOOGLE_CALENDAR_EVENTS_SCOPE));
        return res.status(200).json({
            success: true,
            connected,
            googleEmail: integration?.googleEmail || null,
            connectedAt: integration?.connectedAt || null,
            needsConsent: Boolean(integration) && !connected
        });
    } catch (error) {
        console.error("Google Calendar status lookup failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not load Google Calendar connection status" });
    }
});

// Two-way sync for the currently visible HRMS calendar date range.
router.post("/calendar/sync", protect, authorizeRoles("admin", "hr"), async (req, res) => {
    try {
        const { from, to } = req.body || {};
        if (typeof from !== "string" || typeof to !== "string" ||
            Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) ||
            new Date(to) <= new Date(from) || new Date(to) - new Date(from) > 366 * 86400000) {
            return res.status(400).json({ success: false, message: "Provide a valid calendar date range of no more than 366 days" });
        }
        const integration = await GoogleGmailIntegration.findOne({ userId: req.user.userId })
            .select("+accessTokenEncrypted +refreshTokenEncrypted");
        if (!integration) {
            return res.status(409).json({ success: false, message: "Connect your Google account before syncing Calendar" });
        }
        if (!integration.scopes?.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)) {
            return res.status(409).json({ success: false, message: "Google Calendar permission is required. Reconnect your Google account to grant Calendar access." });
        }

        const accessToken = await getGmailAccessToken(integration);
        const requestedTimeMin = new Date(from).toISOString();
        const requestedTimeMax = new Date(to).toISOString();
        // Read a wider window so a linked event moved across month boundaries is still discovered.
        const timeMin = new Date(new Date(from).getTime() - 366 * 86400000).toISOString();
        const timeMax = new Date(new Date(to).getTime() + 366 * 86400000).toISOString();
        const remoteEvents = [];
        let pageToken = "";
        do {
            const listUrl = new URL(GOOGLE_CALENDAR_API_URL);
            listUrl.searchParams.set("timeMin", timeMin);
            listUrl.searchParams.set("timeMax", timeMax);
            listUrl.searchParams.set("singleEvents", "true");
            listUrl.searchParams.set("showDeleted", "true");
            listUrl.searchParams.set("maxResults", "2500");
            if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
            const page = await calendarApiRequest(listUrl, accessToken);
            remoteEvents.push(...(page.items || []));
            pageToken = page.nextPageToken || "";
        } while (pageToken);

        let imported = 0, pulledUpdates = 0, pushed = 0, cancelled = 0;
        for (const remote of remoteEvents) {
            if (!remote.id) continue;
            if (remote.status === "cancelled") {
                const cancelledLocal = await CompanyEvent.findOne({ googleCalendarMappings: { $elemMatch: { userId: req.user.userId, calendarId: "primary", googleEventId: remote.id } } });
                if (cancelledLocal && cancelledLocal.status !== "cancelled") {
                    cancelledLocal.status = "cancelled";
                    await cancelledLocal.save();
                    pulledUpdates++;
                    cancelled++;
                }
                continue;
            }
            const mapped = fromGoogleCalendarResource(remote);
            if (!mapped) continue;
            let local = await CompanyEvent.findOne({ googleCalendarMappings: { $elemMatch: { userId: req.user.userId, calendarId: "primary", googleEventId: remote.id } } });
            const overlapsRequestedRange = mapped.startAt <= new Date(requestedTimeMax) && mapped.endAt >= new Date(requestedTimeMin);
            if (!local && !overlapsRequestedRange) continue;
            if (!local && remote.status !== "cancelled") {
                local = await CompanyEvent.findOne({
                    title: mapped.title,
                    startAt: mapped.startAt
                });
            }
            // Correct the type when an existing HRMS event is first linked to this Google event.
            if (local && !getCalendarMapping(local, req.user.userId)) {
                local.eventType = mapped.eventType;
            }
            if (!local) {
                if (mapped.status === "cancelled") continue;
                local = await CompanyEvent.create({ ...mapped, googleCalendarMappings: [{ userId: req.user.userId, calendarId: "primary", googleEventId: remote.id, googleUpdatedAt: remote.updated ? new Date(remote.updated) : null }], createdBy: req.user.userId });
                imported++;
                continue;
            }
            const remoteUpdatedAt = remote.updated ? new Date(remote.updated) : new Date(0);
            const localUpdatedAt = local.updatedAt || local.createdAt || new Date(0);
            if (remoteUpdatedAt > localUpdatedAt) {
                Object.assign(local, mapped);
                setCalendarMapping(local, req.user.userId, remote);
                await local.save();
                pulledUpdates++;
            } else {
                setCalendarMapping(local, req.user.userId, remote);
                await local.save();
            }
        }

        const localEvents = await CompanyEvent.find({
            startAt: { $lte: new Date(requestedTimeMax) },
            endAt: { $gte: new Date(requestedTimeMin) }
        }).sort({ startAt: 1, _id: 1 });

        for (const local of localEvents) {
            const mapping = getCalendarMapping(local, req.user.userId);
            if (local.status === "cancelled" && !mapping) continue;
            const resource = toGoogleCalendarResource(local);
            if (mapping?.googleEventId) {
                const remote = remoteEvents.find((item) => item.id === mapping.googleEventId);
                if (remote?.status === "cancelled" && local.status !== "cancelled") continue;
                const remoteUpdatedAt = remote?.updated ? new Date(remote.updated) : new Date(0);
                const localUpdatedAt = local.updatedAt || local.createdAt || new Date(0);
                if (remote && remoteUpdatedAt > localUpdatedAt) continue;
                await calendarApiRequest(`${GOOGLE_CALENDAR_API_URL}/${encodeURIComponent(mapping.googleEventId)}`, accessToken, {
                    method: "PATCH",
                    body: JSON.stringify(resource)
                });
                pushed++;
            } else {
                const created = await calendarApiRequest(GOOGLE_CALENDAR_API_URL, accessToken, {
                    method: "POST",
                    body: JSON.stringify(resource)
                });
                if (created.id) {
                    setCalendarMapping(local, req.user.userId, created);
                    await local.save();
                    pushed++;
                }
            }
        }

        integration.lastUsedAt = new Date();
        await integration.save();
        return res.status(200).json({
            success: true,
            message: "Google Calendar two-way sync completed",
            data: { imported, pulledUpdates, pushed, cancelled, googleEventsSeen: remoteEvents.length }
        });
    } catch (error) {
        console.error("Google Calendar two-way sync failed:", error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Google Calendar sync failed"
        });
    }
});

export default router;
