import express from "express";

import {
    createDepartment,
    getDepartments,
    updateDepartment,
    deleteDepartment
} from "../controllers/departmentController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All Department APIs require login
router.use(protect);

// Only Admin and HR can manage departments
router.use(authorizeRoles("admin", "hr"));

router.post("/", createDepartment);
router.get("/", getDepartments);
router.put("/:id", updateDepartment);
router.delete("/:id", deleteDepartment);

export default router;
