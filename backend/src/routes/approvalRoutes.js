import express from "express";
import { getApprovalInbox } from "../controllers/approvalController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin", "hr", "manager"));
router.get("/", getApprovalInbox);

export default router;
