import express from "express";
import { getLeaveAllocations, saveLeaveAllocation } from "../controllers/leaveAllocationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getLeaveAllocations);
router.put("/", authorizeRoles("admin", "hr"), auditAction("leaves", "leave.allocation.updated"), saveLeaveAllocation);
export default router;
