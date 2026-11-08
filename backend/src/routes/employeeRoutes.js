
import express from "express";

import {
    createEmployee,
    getEmployees,
    getEmployeeById,
    updateEmployee,
    deactivateEmployee,
    activateEmployee
} from "../controllers/employeeController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All employee APIs require authentication
router.use(protect);

// Only Admin and HR can manage employee records
router.use(authorizeRoles("admin", "hr"));

router.post("/", createEmployee);
router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.put("/:id", updateEmployee);
router.patch("/:id/deactivate", deactivateEmployee);
router.patch("/:id/activate", activateEmployee);

export default router;
