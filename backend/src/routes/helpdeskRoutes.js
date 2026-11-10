import express from "express";
import {
    getHelpdeskWorkspace,
    createHelpdeskTicket,
    assignHelpdeskTicket,
    updateHelpdeskTicketStatus
} from "../controllers/helpdeskController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getHelpdeskWorkspace);
router.post("/tickets", auditAction("helpdesk", "helpdesk.ticket_created"), createHelpdeskTicket);
router.patch("/tickets/:id/assign", authorizeRoles("admin", "hr"), auditAction("helpdesk", "helpdesk.ticket_assigned"), assignHelpdeskTicket);
router.patch("/tickets/:id/status", authorizeRoles("admin", "hr"), auditAction("helpdesk", "helpdesk.ticket_status_updated"), updateHelpdeskTicketStatus);

export default router;
