import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getEmployeeHrDetails,
    updateEmployeeHrDetails
} from "../controllers/employeeHrDetailsController.js";

const router = express.Router();
router.use(protect);
router.get("/me", getEmployeeHrDetails);
router.patch("/me", updateEmployeeHrDetails);
router.get("/:employeeId", getEmployeeHrDetails);
router.patch("/:employeeId", updateEmployeeHrDetails);

export default router;
