import express from "express";
import { getShifts, createShift, updateShift, deleteShift } from "../controllers/shiftController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getShifts);
router.post("/", authorizeRoles("admin", "hr"), createShift);
router.put("/:id", authorizeRoles("admin", "hr"), updateShift);
router.delete("/:id", authorizeRoles("admin", "hr"), deleteShift);
export default router;
