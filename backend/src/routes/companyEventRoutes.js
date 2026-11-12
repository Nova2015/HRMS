import express from "express";
import {
    getCompanyEvents,
    createCompanyEvent,
    updateCompanyEvent,
    deleteCompanyEvent
} from "../controllers/companyEventController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getCompanyEvents);
router.post("/", authorizeRoles("admin", "hr"), auditAction("calendar", "calendar.event_created"), createCompanyEvent);
router.put("/:id", authorizeRoles("admin", "hr"), auditAction("calendar", "calendar.event_updated"), updateCompanyEvent);
router.delete("/:id", authorizeRoles("admin", "hr"), auditAction("calendar", "calendar.event_deleted"), deleteCompanyEvent);

export default router;
