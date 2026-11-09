import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import SalaryStructure from "../models/SalaryStructure.js";
import Payroll from "../models/Payroll.js";
import { generatePayslipDocument } from "../services/employeeDocumentGenerator.js";

const isPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalizeLines = (lines) => {
    if (!Array.isArray(lines)) return null;
    if (lines.length > 30) return null;
    const result = [];
    for (const line of lines) {
        const name = String(line?.name || "").trim();
        const amount = Number(line?.amount);
        if (!line || typeof line !== "object" || !name || name.length > 80 ||
            !Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return null;
        result.push({ name, amount: money(amount) });
    }
    return result;
};

export const listSalaryStructures = async (req, res) => {
    try {
        const structures = await SalaryStructure.find()
            .populate("employee", "employeeCode firstName lastName department")
            .sort({ updatedAt: -1 });
        res.json({ success: true, count: structures.length, data: structures });
    } catch (error) {
        console.error("List salary structures:", error);
        res.status(500).json({ success: false, message: "Unable to load salary structures" });
    }
};

export const saveSalaryStructure = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { monthlyBasic, earnings = [], deductions = [], effectiveFrom } = req.body || {};
        if (!mongoose.isValidObjectId(employeeId)) return res.status(400).json({ success: false, message: "Invalid employee ID" });
        const basic = Number(monthlyBasic);
        const earningLines = normalizeLines(earnings);
        const deductionLines = normalizeLines(deductions);
        const date = new Date(effectiveFrom);
        if (!Number.isFinite(basic) || basic < 0 || basic > 1_000_000_000 ||
            !earningLines || !deductionLines || !effectiveFrom || Number.isNaN(date.getTime())) {
            return res.status(400).json({ success: false, message: "Provide valid basic salary, component lines and effective date" });
        }
        const employee = await Employee.findById(employeeId);
        if (!employee || employee.employmentStatus !== "active") return res.status(404).json({ success: false, message: "Active employee not found" });
        const data = await SalaryStructure.findOneAndUpdate(
            { employee: employeeId },
            { $set: { monthlyBasic: money(basic), earnings: earningLines, deductions: deductionLines, effectiveFrom: date, isActive: true, createdBy: req.user.userId } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).populate("employee", "employeeCode firstName lastName");
        res.status(200).json({ success: true, message: "Salary structure saved", data });
    } catch (error) {
        console.error("Save salary structure:", error);
        res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: "Unable to save salary structure" });
    }
};

export const listPayroll = async (req, res) => {
    try {
        const { period } = req.query;
        if (!isPeriod(period)) return res.status(400).json({ success: false, message: "Period must be YYYY-MM" });
        const filter = { period };
        if (!["admin", "hr"].includes(req.user.role)) filter.employee = req.user.employeeId;
        const data = await Payroll.find(filter)
            .populate("employee", "employeeCode firstName lastName department")
            .sort({ createdAt: -1 });
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("List payroll:", error);
        res.status(500).json({ success: false, message: "Unable to load payroll" });
    }
};

export const processPayroll = async (req, res) => {
    try {
        const { period, workingDays, employees } = req.body || {};
        const days = Number(workingDays);
        if (!isPeriod(period) || !Number.isInteger(days) || days < 1 || days > 31 ||
            !Array.isArray(employees) || !employees.length || employees.length > 500) {
            return res.status(400).json({ success: false, message: "Provide a valid YYYY-MM period, working days and employee paid-day entries" });
        }
        const monthEnd = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0);
        if (days > monthEnd.getDate()) return res.status(400).json({ success: false, message: "Working days cannot exceed calendar days in the month" });
        if (employees.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
            return res.status(400).json({ success: false, message: "Invalid payroll employee entry" });
        }
        const ids = employees.map((entry) => String(entry.employeeId || ""));
        if (ids.some((id) => !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) {
            return res.status(400).json({ success: false, message: "Invalid or duplicate employee in payroll request" });
        }
        if (await Payroll.exists({ period, employee: { $in: ids } })) {
            return res.status(409).json({ success: false, message: "Payroll already exists for one or more employees in this period. Existing payroll is not overwritten." });
        }
        const structures = await SalaryStructure.find({ employee: { $in: ids }, isActive: true });
        const structureMap = new Map(structures.map((item) => [item.employee.toString(), item]));
        const employeeDocs = await Employee.find({ _id: { $in: ids }, employmentStatus: "active" }).select("_id");
        const activeIds = new Set(employeeDocs.map((item) => item._id.toString()));
        const records = [];
        const periodStart = new Date(`${period}-01T00:00:00.000Z`);
        for (const entry of employees) {
            const employeeId = String(entry.employeeId);
            const structure = structureMap.get(employeeId);
            const paidDays = Number(entry.paidDays);
            if (!activeIds.has(employeeId) || !structure) return res.status(400).json({ success: false, message: "Every selected employee must be active and have a salary structure" });
            if (new Date(structure.effectiveFrom) > periodStart) {
                return res.status(400).json({ success: false, message: "Salary structure is not effective for the selected payroll period" });
            }
            if (!Number.isFinite(paidDays) || paidDays < 0 || paidDays > days) return res.status(400).json({ success: false, message: "Paid days must be between zero and working days" });
            const ratio = paidDays / days;
            const basic = money(structure.monthlyBasic * ratio);
            const earnings = structure.earnings.map((line) => ({ name: line.name, amount: money(line.amount * ratio) }));
            const deductions = structure.deductions.map((line) => ({ name: line.name, amount: money(line.amount * ratio) }));
            const grossEarnings = money(basic + earnings.reduce((sum, line) => sum + line.amount, 0));
            const totalDeductions = money(deductions.reduce((sum, line) => sum + line.amount, 0));
            if (totalDeductions > grossEarnings) return res.status(400).json({ success: false, message: `Deductions exceed gross earnings for employee ${employeeId}` });
            records.push({ employee: employeeId, salaryStructure: structure._id, period, workingDays: days, paidDays, basic, earnings, deductions, grossEarnings, totalDeductions, netPay: money(grossEarnings - totalDeductions), processedBy: req.user.userId });
        }
        const created = await Payroll.insertMany(records, { ordered: true });
        const data = await Payroll.find({ _id: { $in: created.map((item) => item._id) } }).populate("employee", "employeeCode firstName lastName");
        res.status(201).json({ success: true, message: "Payroll processed", count: data.length, data });
    } catch (error) {
        console.error("Process payroll:", error);
        res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.code === 11000 ? "Payroll already exists for this employee and period" : "Unable to process payroll" });
    }
};

export const getPayslip = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid payslip ID" });
        const payroll = await Payroll.findById(req.params.id).populate("employee", "employeeCode firstName lastName email department designation");
        if (!payroll || !payroll.employee) return res.status(404).json({ success: false, message: "Payslip not found" });
        if (!["admin", "hr"].includes(req.user.role) && payroll.employee._id.toString() !== req.user.employeeId) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        res.json({ success: true, data: payroll });
    } catch (error) {
        console.error("Get payslip:", error);
        res.status(500).json({ success: false, message: "Unable to load payslip" });
    }
};

const issuePayslipForPaidPayroll = async (payrollId, issuedBy) => {
    const payroll = await Payroll.findOne({ _id: payrollId, status: "paid" })
        .populate("employee", "employeeCode firstName lastName email");
    if (!payroll) return null;
    const document = await generatePayslipDocument(payroll, issuedBy);
    return { payroll, document };
};

export const generatePaidPayslip = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid payroll ID" });
        const result = await issuePayslipForPaidPayroll(req.params.id, req.user.userId);
        if (!result) return res.status(409).json({ success: false, message: "Payslip can be generated only after payroll is marked paid" });
        return res.json({ success: true, message: "Payslip generated and delivered to employee documents", data: result.document });
    } catch (error) {
        console.error("Generate paid payslip:", error.message);
        return res.status(500).json({ success: false, message: "Unable to generate payslip. HR can retry the generation." });
    }
};

export const markPayrollPaid = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid payroll ID" });
        const payroll = await Payroll.findOneAndUpdate(
            { _id: req.params.id, status: "processed" },
            { $set: { status: "paid", paidAt: new Date() } },
            { new: true, runValidators: true }
        );
        if (!payroll) {
            const exists = await Payroll.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                success: false,
                message: exists ? "Payroll is already marked paid" : "Payroll record not found"
            });
        }
        try {
            const result = await issuePayslipForPaidPayroll(payroll._id, req.user.userId);
            return res.json({ success: true, message: "Payroll marked paid and payslip delivered to employee documents", data: { payroll: result.payroll, document: result.document } });
        } catch (documentError) {
            console.error("Automatic payslip generation failed:", documentError.message);
            return res.json({ success: true, message: "Payroll marked paid. Payslip generation failed; HR can retry it from the payroll record.", data: { payroll, payslipGenerated: false } });
        }
    } catch (error) {
        console.error("Mark payroll paid:", error);
        res.status(500).json({ success: false, message: "Unable to update payroll status" });
    }
};
