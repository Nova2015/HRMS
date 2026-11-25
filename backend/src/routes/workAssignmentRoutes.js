import express from "express";
import {
    getWorkAssignments,
    createWorkAssignment,
    delegateWorkAssignment,
    updateMyWorkStatus,
    reviewWorkAssignment
} from "../controllers/workAssignmentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);

router.get("/", authorizeRoles("admin", "hr", "manager", "team_leader", "employee"), getWorkAssignments);
router.post("/", authorizeRoles("admin", "hr", "manager"), auditAction("work_assignment", "work.created"), createWorkAssignment);
router.post("/:id/delegate", authorizeRoles("team_leader"), auditAction("work_assignment", "work.delegated"), delegateWorkAssignment);
router.patch("/:id/status", authorizeRoles("admin", "hr", "manager", "team_leader", "employee"), auditAction("work_assignment", "work.status_updated"), updateMyWorkStatus);
router.patch("/:id/review", authorizeRoles("admin", "hr", "manager", "team_leader", "employee"), auditAction("work_assignment", "work.reviewed"), reviewWorkAssignment);

export default router;
