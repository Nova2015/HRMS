import express from "express";
import {
    createLeaveRequest,
    getLeaveRequests,
    reviewLeaveRequest,
    cancelLeaveRequest
} from "../controllers/leaveController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getLeaveRequests);
router.post("/", auditAction("leaves", "leave.requested"), createLeaveRequest);
router.patch("/:id/review", authorizeRoles("admin", "hr", "manager"), auditAction("leaves", "leave.reviewed"), reviewLeaveRequest);
router.patch("/:id/cancel", auditAction("leaves", "leave.cancelled"), cancelLeaveRequest);

export default router;
