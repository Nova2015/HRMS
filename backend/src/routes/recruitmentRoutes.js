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
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin", "hr"));
router.get("/", getRecruitmentWorkspace);
router.post("/jobs", auditAction("recruitment", "recruitment.job_created"), createJobOpening);
router.patch("/jobs/:id/status", auditAction("recruitment", "recruitment.job_status_updated"), updateJobOpeningStatus);
router.post("/candidates", auditAction("recruitment", "recruitment.candidate_created"), createCandidate);
router.patch("/candidates/:id/status", auditAction("recruitment", "recruitment.candidate_status_updated"), updateCandidateStatus);
router.post("/candidates/:id/hire", auditAction("recruitment", "recruitment.candidate_hired"), hireCandidate);

export default router;
