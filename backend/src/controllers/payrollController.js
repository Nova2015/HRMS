import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import SalaryStructure from "../models/SalaryStructure.js";
import Payroll from "../models/Payroll.js";
import { calculateAutomaticProration, calculateManualProration } from "../utils/salaryProration.js";
import { generatePayslipDocument, generateSalaryRevisionDocument } from "../services/employeeDocumentGenerator.js";

const isPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
const isValidDateOnly = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
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
        const data = structures.map((item) => {
            const value = item.toObject();
            if (!value.revisions?.length) value.revisions = [{
                _id: item._id, monthlyBasic: item.monthlyBasic, earnings: item.earnings,
                deductions: item.deductions, effectiveFrom: item.effectiveFrom,
                createdBy: item.createdBy, createdAt: item.createdAt
            }];
            value.revisions.sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));
            return value;
        });
        res.json({ success: true, count: data.length, data });
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
            !earningLines || !deductionLines || !isValidDateOnly(effectiveFrom) || Number.isNaN(date.getTime())) {
            return res.status(400).json({ success: false, message: "Provide valid basic salary, component lines and effective date" });
        }

        const employee = await Employee.findById(employeeId)
            .populate("department", "name")
            .populate("designation", "name")
            .populate("shift", "name");
        if (!employee || employee.employmentStatus !== "active") {
            return res.status(404).json({ success: false, message: "Active employee not found" });
        }

        const existingStructure = await SalaryStructure.findOne({ employee: employeeId });
        const previousRevisions = existingStructure?.revisions?.length
            ? existingStructure.revisions.map((item) => item.toObject())
            : existingStructure ? [{
                monthlyBasic: existingStructure.monthlyBasic,
                earnings: existingStructure.earnings,
                deductions: existingStructure.deductions,
                effectiveFrom: existingStructure.effectiveFrom,
                createdBy: existingStructure.createdBy,
                createdAt: existingStructure.createdAt
            }] : [];
        if (previousRevisions.some((item) => new Date(item.effectiveFrom).getTime() === date.getTime())) {
            return res.status(409).json({ success: false, message: "A salary revision already exists for this effective date" });
        }
        const revision = {
            monthlyBasic: money(basic), earnings: earningLines, deductions: deductionLines,
            effectiveFrom: date, createdBy: req.user.userId, createdAt: new Date()
        };
        const nextRevisions = [...previousRevisions, revision].sort((x, y) => new Date(x.effectiveFrom) - new Date(y.effectiveFrom));
        let data;
        if (existingStructure) {
            existingStructure.revisions = nextRevisions;
            const latest = nextRevisions[nextRevisions.length - 1];
            existingStructure.monthlyBasic = latest.monthlyBasic;
            existingStructure.earnings = latest.earnings;
            existingStructure.deductions = latest.deductions;
            existingStructure.effectiveFrom = latest.effectiveFrom;
            existingStructure.createdBy = latest.createdBy;
            await existingStructure.save();
            data = await SalaryStructure.findById(existingStructure._id).populate("employee", "employeeCode firstName lastName");
        } else {
            data = await SalaryStructure.create({
                employee: employeeId, monthlyBasic: revision.monthlyBasic, earnings: revision.earnings,
                deductions: revision.deductions, effectiveFrom: revision.effectiveFrom,
                revisions: nextRevisions, isActive: true, createdBy: req.user.userId
            });
            await data.populate("employee", "employeeCode firstName lastName");
        }

        const previousRevision = [...previousRevisions]
            .filter((item) => new Date(item.effectiveFrom) < date)
            .sort((x, y) => new Date(y.effectiveFrom) - new Date(x.effectiveFrom))[0];
        let generatedDocument = null;
        let documentWarning = "";
        if (previousRevision) {
            try {
                generatedDocument = await generateSalaryRevisionDocument(employee, previousRevision, revision, req.user.userId);
            } catch (documentError) {
                documentWarning = " Salary structure was saved, but automatic revision letter generation failed.";
                console.error("Automatic salary revision letter generation failed:", documentError.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Salary structure saved." + documentWarning,
            data,
            generatedDocument
        });
    } catch (error) {
        console.error("Save salary structure:", error);
        const conflict = error.code === 11000 || error.name === "VersionError";
        return res.status(conflict ? 409 : 400).json({ success: false, message: error.name === "VersionError" ? "Salary structure changed concurrently. Refresh and retry the salary revision." : error.code === 11000 ? "Salary structure already exists" : "Unable to save salary structure" });
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
        const structures = await SalaryStructure.find({ employee: { $in: ids }, isActive: true });
        const structureMap = new Map(structures.map((item) => [item.employee.toString(), item]));
        const employeeDocs = await Employee.find({ _id: { $in: ids }, employmentStatus: "active" }).select("_id");
        const activeIds = new Set(employeeDocs.map((item) => item._id.toString()));
        const records = [];
        const year = Number(period.slice(0, 4));
        const month = Number(period.slice(5, 7));
        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        const periodEnd = new Date(Date.UTC(year, month, 1));
        const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

        for (const entry of employees) {
            const employeeId = String(entry.employeeId);
            const structure = structureMap.get(employeeId);
            const totalPaidDays = Number(entry.paidDays);
            if (!activeIds.has(employeeId) || !structure) return res.status(400).json({ success: false, message: "Every selected employee must be active and have a salary structure" });
            if (!Number.isFinite(totalPaidDays) || totalPaidDays < 0 || totalPaidDays > days) return res.status(400).json({ success: false, message: "Paid days must be between zero and working days" });

            const revisions = structure.revisions?.length ? structure.revisions.map((item) => item.toObject ? item.toObject() : item) : [{
                _id: structure._id, monthlyBasic: structure.monthlyBasic, earnings: structure.earnings,
                deductions: structure.deductions, effectiveFrom: structure.effectiveFrom
            }];
            revisions.sort((x, y) => new Date(x.effectiveFrom) - new Date(y.effectiveFrom));
            const applicable = revisions.filter((item) => new Date(item.effectiveFrom) < periodEnd);
            const initial = applicable.filter((item) => new Date(item.effectiveFrom) <= periodStart).at(-1);
            if (!initial) return res.status(400).json({ success: false, message: "Salary structure is not effective for the selected payroll period" });
            const inMonth = applicable.filter((item) => new Date(item.effectiveFrom) > periodStart);
            const boundaries = [initial, ...inMonth];
            const segments = boundaries.map((revision, index) => {
                const from = index === 0 ? periodStart : new Date(revision.effectiveFrom);
                const to = boundaries[index + 1] ? new Date(boundaries[index + 1].effectiveFrom) : periodEnd;
                return { revision, from, to, calendarShare: (to.getTime() - from.getTime()) / 86400000 };
            });

            let segmentWorkingDays;
            let segmentPaidDays;
            if (entry.prorationMode === "manual") {
                if (segments.length !== 2) return res.status(400).json({ success: false, message: "Manual proration requires exactly one salary revision in the selected month. Use automatic proration for multiple revisions." });
                try {
                    const split = calculateManualProration(
                        days, totalPaidDays,
                        Number(entry.oldWorkingDays), Number(entry.newWorkingDays),
                        Number(entry.oldPaidDays), Number(entry.newPaidDays)
                    );
                    segmentWorkingDays = split.workingDays;
                    segmentPaidDays = split.paidDays;
                } catch {
                    return res.status(400).json({ success: false, message: "Manual split totals must match monthly working days and paid days; paid days cannot exceed working days." });
                }
            } else {
                const split = calculateAutomaticProration(
                    days, totalPaidDays, calendarDays, segments.map((segment) => segment.calendarShare)
                );
                segmentWorkingDays = split.workingDays;
                segmentPaidDays = split.paidDays;
            }

            const salaryBreakdown = [];
            let basic = 0;
            const earningsMap = new Map();
            const deductionsMap = new Map();
            segments.forEach((segment, index) => {
                const ratio = segmentPaidDays[index] / days;
                const segmentBasic = money(segment.revision.monthlyBasic * ratio);
                basic += segmentBasic;
                const segmentEarnings = (segment.revision.earnings || []).map((line) => {
                    const amount = money(line.amount * ratio);
                    earningsMap.set(line.name, money((earningsMap.get(line.name) || 0) + amount));
                    return { name: line.name, amount };
                });
                const segmentDeductions = (segment.revision.deductions || []).map((line) => {
                    const amount = money(line.amount * ratio);
                    deductionsMap.set(line.name, money((deductionsMap.get(line.name) || 0) + amount));
                    return { name: line.name, amount };
                });
                salaryBreakdown.push({
                    salaryStructure: structure._id, effectiveFrom: segment.from, effectiveTo: new Date(segment.to.getTime() - 86400000),
                    workingDays: money(segmentWorkingDays[index]), paidDays: money(segmentPaidDays[index]),
                    basic: segmentBasic, earnings: segmentEarnings, deductions: segmentDeductions
                });
            });
            basic = money(basic);
            const earnings = [...earningsMap].map(([name, amount]) => ({ name, amount }));
            const deductions = [...deductionsMap].map(([name, amount]) => ({ name, amount }));
            const grossEarnings = money(basic + earnings.reduce((sum, line) => sum + line.amount, 0));
            const totalDeductions = money(deductions.reduce((sum, line) => sum + line.amount, 0));
            if (totalDeductions > grossEarnings) return res.status(400).json({ success: false, message: `Deductions exceed gross earnings for employee ${employeeId}` });
            records.push({
                employee: employeeId, salaryStructure: structure._id, salaryBreakdown, period,
                workingDays: days, paidDays: totalPaidDays, basic, earnings, deductions,
                grossEarnings, totalDeductions, netPay: money(grossEarnings - totalDeductions),
                processedBy: req.user.userId
            });
        }
        // A payroll batch must be all-or-nothing, including concurrent duplicate requests.
        // The unique employee/period index remains the final concurrency guard.
        const session = await mongoose.startSession();
        let created = [];
        try {
            await session.withTransaction(async () => {
                if (await Payroll.exists({ period, employee: { $in: ids } }).session(session)) {
                    const duplicateError = new Error("Payroll already exists for one or more employees in this period");
                    duplicateError.code = 11000;
                    throw duplicateError;
                }
                created = await Payroll.insertMany(records, { ordered: true, session });
            });
        } finally {
            await session.endSession();
        }
        const data = await Payroll.find({ _id: { $in: created.map((item) => item._id) } }).populate("employee", "employeeCode firstName lastName");
        res.status(201).json({ success: true, message: "Payroll processed", count: data.length, data });
    } catch (error) {
        console.error("Process payroll:", error);
        const transactionUnavailable = error.hasErrorLabel?.("TransientTransactionError") ||
            error.hasErrorLabel?.("UnknownTransactionCommitResult") ||
            /transaction numbers are only allowed|replica set|mongos/i.test(error.message || "");
        const statusCode = error.code === 11000 ? 409 : transactionUnavailable ? 503 : 400;
        res.status(statusCode).json({
            success: false,
            message: statusCode === 409 ? "Payroll already exists for one or more employees in this period"
                : statusCode === 503 ? "Payroll processing is temporarily unavailable; please retry"
                : "Unable to process payroll"
        });
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
