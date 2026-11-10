import express from "express";
import {
    getHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday
} from "../controllers/holidayController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getHolidays);
router.post("/", authorizeRoles("admin", "hr"), auditAction("holidays", "holiday.created"), createHoliday);
router.put("/:id", authorizeRoles("admin", "hr"), auditAction("holidays", "holiday.updated"), updateHoliday);
router.delete("/:id", authorizeRoles("admin", "hr"), auditAction("holidays", "holiday.deleted"), deleteHoliday);

export default router;
