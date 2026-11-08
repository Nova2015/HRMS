import express from "express";
import {
    createLeaveRequest,
    getLeaveRequests,
    reviewLeaveRequest,
    cancelLeaveRequest
} from "../controllers/leaveController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getLeaveRequests);
router.post("/", createLeaveRequest);
router.patch("/:id/review", authorizeRoles("admin", "hr"), reviewLeaveRequest);
router.patch("/:id/cancel", cancelLeaveRequest);

export default router;
