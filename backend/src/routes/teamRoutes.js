import express from "express";
import { createTeam, getTeams, updateTeam, deleteTeam } from "../controllers/teamController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);
router.use(authorizeRoles("admin", "hr"));

router.post("/", auditAction("organization", "team.created"), createTeam);
router.get("/", getTeams);
router.put("/:id", auditAction("organization", "team.updated"), updateTeam);
router.delete("/:id", auditAction("organization", "team.deleted"), deleteTeam);

export default router;
