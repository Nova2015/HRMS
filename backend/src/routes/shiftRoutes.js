import express from "express";
import { getShifts, createShift, updateShift, deleteShift } from "../controllers/shiftController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getShifts);
router.post("/", authorizeRoles("admin", "hr"), auditAction("shifts", "shift.created"), createShift);
router.put("/:id", authorizeRoles("admin", "hr"), auditAction("shifts", "shift.updated"), updateShift);
router.delete("/:id", authorizeRoles("admin", "hr"), auditAction("shifts", "shift.deleted"), deleteShift);
export default router;
