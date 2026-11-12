import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";
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
router.put("/salary-structures/:employeeId", authorizeRoles("admin", "hr"), auditAction("payroll", "payroll.salary_structure_updated"), saveSalaryStructure);
router.get("/", listPayroll);
router.post("/process", authorizeRoles("admin", "hr"), auditAction("payroll", "payroll.processed"), processPayroll);
router.get("/:id/payslip", getPayslip);
router.post("/:id/payslip/generate", authorizeRoles("admin", "hr"), auditAction("payroll", "payroll.payslip_generated"), generatePaidPayslip);
router.patch("/:id/paid", authorizeRoles("admin", "hr"), auditAction("payroll", "payroll.marked_paid"), markPayrollPaid);
export default router;
