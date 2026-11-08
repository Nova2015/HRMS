import express from "express";

import {
    createEmployee,
    getEmployees,
    getEmployeeById,
    updateEmployee,
    deactivateEmployee
} from "../controllers/employeeController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);

// Employee records are currently restricted to Admin and HR
router.use(authorizeRoles("admin", "hr"));

router.post("/", createEmployee);
router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.put("/:id", updateEmployee);
router.patch("/:id/deactivate", deactivateEmployee);

export default router;
