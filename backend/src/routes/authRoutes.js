import express from "express";

import {
    login,
    getMe,
    updateProfilePhoto,
    changePassword
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.post("/login", loginRateLimit, login);
router.get("/me", protect, getMe);
router.put("/me/photo", protect, updateProfilePhoto);
router.put("/change-password", protect, auditAction("auth", "password.changed"), changePassword);

export default router;
