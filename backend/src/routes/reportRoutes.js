import express from "express";
import { getReportsSummary } from "../controllers/reportController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(protect, authorizeRoles("admin", "hr"));
router.get("/summary", getReportsSummary);

export default router;
