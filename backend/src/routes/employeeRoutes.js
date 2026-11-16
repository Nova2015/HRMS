
import express from "express";

import {
    createEmployee,
    getEmployees,
    getEmployeeById,
    updateEmployee,
    deactivateEmployee,
    archiveEmployee,
    activateEmployee,
    resetEmployeePassword
} from "../controllers/employeeController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

// All employee APIs require authentication
router.use(protect);

// Only Admin and HR can manage employee records
router.use(authorizeRoles("admin", "hr"));

router.post("/", auditAction("employees", "employee.created"), createEmployee);
router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.put("/:id", auditAction("employees", "employee.updated"), updateEmployee);
router.patch("/:id/reset-password", authorizeRoles("admin"), auditAction("employees", "employee.password_reset"), resetEmployeePassword);
router.patch("/:id/deactivate", auditAction("employees", "employee.deactivated"), deactivateEmployee);
router.delete("/:id", authorizeRoles("admin"), auditAction("employees", "employee.archived"), archiveEmployee);
router.patch("/:id/activate", auditAction("employees", "employee.activated"), activateEmployee);

export default router;
