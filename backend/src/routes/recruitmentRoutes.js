import express from "express";
import {
    getRecruitmentWorkspace,
    createJobOpening,
    updateJobOpeningStatus,
    createCandidate,
    updateCandidateStatus,
    hireCandidate
} from "../controllers/recruitmentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin", "hr"));
router.get("/", getRecruitmentWorkspace);
router.post("/jobs", createJobOpening);
router.patch("/jobs/:id/status", updateJobOpeningStatus);
router.post("/candidates", createCandidate);
router.patch("/candidates/:id/status", updateCandidateStatus);
router.post("/candidates/:id/hire", hireCandidate);

export default router;
