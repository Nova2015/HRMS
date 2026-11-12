import express from "express";
import {
    getPerformanceReviews,
    createPerformanceCycle,
    submitSelfReview,
    submitManagerReview
} from "../controllers/performanceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getPerformanceReviews);
router.post("/cycles", authorizeRoles("admin", "hr"), auditAction("performance", "performance.cycle_created"), createPerformanceCycle);
router.put("/:id/self-review", auditAction("performance", "performance.self_review_submitted"), submitSelfReview);
router.put("/:id/manager-review", authorizeRoles("admin", "hr", "manager"), auditAction("performance", "performance.manager_reviewed"), submitManagerReview);

export default router;
