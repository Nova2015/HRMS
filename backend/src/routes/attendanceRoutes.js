import express from "express";

import {
    checkIn,
    checkOut,
    getTodayAttendance,
    getMyAttendance,
    getAttendanceRegister,
    getAttendanceTeam,
    saveManualAttendance
} from "../controllers/attendanceController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

// Every attendance API requires authentication.
router.use(protect);

// Employee self-service
router.get("/today", getTodayAttendance);
router.get("/me", getMyAttendance);
router.get("/team", authorizeRoles("admin", "hr", "manager"), getAttendanceTeam);
router.post("/check-in", auditAction("attendance", "attendance.checked_in"), checkIn);
router.post("/check-out", auditAction("attendance", "attendance.checked_out"), checkOut);

// Admin / HR can view the complete register.
router.get("/", getAttendanceRegister);

// Only Admin / HR can manually create or correct attendance.
router.post(
    "/manual",
    authorizeRoles("admin", "hr"),
    auditAction("attendance", "attendance.manual_updated"),
    saveManualAttendance
);

export default router;