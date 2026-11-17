import express from "express";

import {
    login,
    getMe,
    updateProfilePhoto,
    changePassword,
    logoutAllDevices,
    getSessions,
    revokeSession,
    logout
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";
import { passwordChangeRateLimit } from "../middleware/passwordChangeRateLimit.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.post("/login", loginRateLimit, login);
router.get("/me", protect, getMe);
router.get("/sessions", protect, getSessions);
router.delete("/sessions/:sessionId", protect, revokeSession);
router.post("/logout", protect, logout);
router.put("/me/photo", protect, auditAction("auth", "profile.photo_updated"), updateProfilePhoto);
router.put("/change-password", protect, auditAction("auth", "password.changed"), passwordChangeRateLimit, changePassword);
router.post("/logout-all-devices", protect, auditAction("auth", "sessions.revoked"), logoutAllDevices);

export default router;
