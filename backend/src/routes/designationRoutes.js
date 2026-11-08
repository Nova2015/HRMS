import express from "express";

import {
    createDesignation,
    getDesignations
} from "../controllers/designationController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorizeRoles("admin", "hr"));

router.post("/", createDesignation);
router.get("/", getDesignations);

export default router;
