import express from "express";
import {
    getHelpdeskWorkspace,
    createHelpdeskTicket,
    assignHelpdeskTicket,
    updateHelpdeskTicketStatus
} from "../controllers/helpdeskController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getHelpdeskWorkspace);
router.post("/tickets", createHelpdeskTicket);
router.patch("/tickets/:id/assign", authorizeRoles("admin", "hr"), assignHelpdeskTicket);
router.patch("/tickets/:id/status", authorizeRoles("admin", "hr"), updateHelpdeskTicketStatus);

export default router;
