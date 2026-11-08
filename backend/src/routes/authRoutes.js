import express from "express";

import {
    login,
    getMe,
    changePassword
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";

const router = express.Router();

router.post("/login", loginRateLimit, login);
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);

export default router;
