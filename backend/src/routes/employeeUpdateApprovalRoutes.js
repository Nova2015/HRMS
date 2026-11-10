import express from "express";
import {
    createEmployeeUpdateProposal,
    getEmployeeUpdateProposals,
    decideEmployeeUpdateProposal,
    createApprovalTestFixture,
    deleteApprovalTestFixture
} from "../controllers/employeeUpdateApprovalController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect, authorizeRoles("admin", "hr"));
router.get("/", getEmployeeUpdateProposals);
router.post("/", auditAction("approvals", "approval.proposal_created"), createEmployeeUpdateProposal);
router.patch("/:id/decision", auditAction("approvals", "approval.decided"), decideEmployeeUpdateProposal);
router.post("/test-fixture", authorizeRoles("admin"), createApprovalTestFixture);
router.delete("/test-fixture/:employeeId", authorizeRoles("admin"), deleteApprovalTestFixture);

export default router;
