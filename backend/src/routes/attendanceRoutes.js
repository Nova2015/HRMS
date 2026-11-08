import express from "express";

import {
    checkIn,
    checkOut,
    getTodayAttendance,
    getMyAttendance,
    getAttendanceRegister,
    saveManualAttendance
} from "../controllers/attendanceController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Every attendance API requires authentication.
router.use(protect);

// Employee self-service
router.get("/today", getTodayAttendance);
router.get("/me", getMyAttendance);
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

// Admin / HR can view the complete register.
router.get("/", getAttendanceRegister);

// Only Admin / HR can manually create or correct attendance.
router.post(
    "/manual",
    authorizeRoles("admin", "hr"),
    saveManualAttendance
);

export default router;