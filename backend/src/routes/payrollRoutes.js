import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    listSalaryStructures,
    saveSalaryStructure,
    listPayroll,
    processPayroll,
    getPayslip,
    markPayrollPaid,
    generatePaidPayslip
} from "../controllers/payrollController.js";

const router = express.Router();
router.use(protect);
router.get("/salary-structures", authorizeRoles("admin", "hr"), listSalaryStructures);
router.put("/salary-structures/:employeeId", authorizeRoles("admin", "hr"), saveSalaryStructure);
router.get("/", listPayroll);
router.post("/process", authorizeRoles("admin", "hr"), processPayroll);
router.get("/:id/payslip", getPayslip);
router.post("/:id/payslip/generate", authorizeRoles("admin", "hr"), generatePaidPayslip);
router.patch("/:id/paid", authorizeRoles("admin", "hr"), markPayrollPaid);
export default router;
