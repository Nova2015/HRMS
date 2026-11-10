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

const router = express.Router();
router.use(protect, authorizeRoles("admin", "hr"));
router.get("/", getEmployeeUpdateProposals);
router.post("/", createEmployeeUpdateProposal);
router.patch("/:id/decision", decideEmployeeUpdateProposal);
router.post("/test-fixture", authorizeRoles("admin"), createApprovalTestFixture);
router.delete("/test-fixture/:employeeId", authorizeRoles("admin"), deleteApprovalTestFixture);

export default router;
