import express from "express";

import {
    createDesignation,
    getDesignations,
    updateDesignation
} from "../controllers/designationController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorizeRoles("admin", "hr"));

router.post("/", createDesignation);
router.get("/", getDesignations);
router.put("/:id", updateDesignation);

export default router;
