import express from "express";

import {
    createDepartment,
    getDepartments,
    updateDepartment,
    deleteDepartment
} from "../controllers/departmentController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

// All Department APIs require login
router.use(protect);

// Only Admin and HR can manage departments
router.use(authorizeRoles("admin", "hr"));

router.post("/", auditAction("organization", "department.created"), createDepartment);
router.get("/", getDepartments);
router.put("/:id", auditAction("organization", "department.updated"), updateDepartment);
router.delete("/:id", auditAction("organization", "department.deleted"), deleteDepartment);

export default router;
