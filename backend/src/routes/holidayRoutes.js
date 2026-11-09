import express from "express";
import {
    getHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday
} from "../controllers/holidayController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getHolidays);
router.post("/", authorizeRoles("admin", "hr"), createHoliday);
router.put("/:id", authorizeRoles("admin", "hr"), updateHoliday);
router.delete("/:id", authorizeRoles("admin", "hr"), deleteHoliday);

export default router;
