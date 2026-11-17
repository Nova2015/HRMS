import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getEmployeeHrDetails,
    updateEmployeeHrDetails
} from "../controllers/employeeHrDetailsController.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();
router.use(protect);
router.get("/me", getEmployeeHrDetails);
router.patch("/me", auditAction("employee_hr_details", "employee.hr_details_updated"), updateEmployeeHrDetails);
router.get("/:employeeId", getEmployeeHrDetails);
router.patch("/:employeeId", auditAction("employee_hr_details", "employee.hr_details_updated"), updateEmployeeHrDetails);

export default router;
