import express from "express";
import {
    getPerformanceReviews,
    createPerformanceCycle,
    submitSelfReview,
    submitManagerReview
} from "../controllers/performanceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/", getPerformanceReviews);
router.post("/cycles", authorizeRoles("admin", "hr"), createPerformanceCycle);
router.put("/:id/self-review", submitSelfReview);
router.put("/:id/manager-review", authorizeRoles("admin", "hr", "manager"), submitManagerReview);

export default router;
