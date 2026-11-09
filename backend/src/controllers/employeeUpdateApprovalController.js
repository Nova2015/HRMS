import mongoose from "mongoose";
import EmployeeUpdateApproval from "../models/EmployeeUpdateApproval.js";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import Shift from "../models/Shift.js";
import User from "../models/User.js";

// External sources must never change login credentials or sensitive HR/bank identifiers.
const ALLOWED_PROPOSAL_FIELDS = new Set([
    "firstName", "lastName", "phone", "department", "designation",
    "shift", "reportingManager", "joiningDate", "employmentStatus"
]);

const validateProposal = (changes) => {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
        return "proposedChanges must be an object";
    }
    const keys = Object.keys(changes);
    if (!keys.length) return "At least one proposed field is required";
    const invalid = keys.find((key) => !ALLOWED_PROPOSAL_FIELDS.has(key));
    if (invalid) return `Field "${invalid}" cannot be changed through external approval`;
    for (const field of ["firstName", "lastName", "phone"]) {
        if (changes[field] !== undefined && typeof changes[field] !== "string") {
            return `${field} must be text`;
        }
    }
    if (changes.employmentStatus !== undefined &&
        !["active", "inactive", "resigned", "terminated"].includes(changes.employmentStatus)) {
        return "Invalid employment status";
    }
    if (changes.joiningDate !== undefined && Number.isNaN(new Date(changes.joiningDate).getTime())) {
        return "Invalid joining date";
    }
    for (const field of ["department", "designation", "shift", "reportingManager"]) {
        if (changes[field] !== undefined && changes[field] !== null && changes[field] !== "" &&
            !mongoose.isValidObjectId(changes[field])) return `Invalid ${field} ID`;
    }
    return null;
};

const normalizeChanges = (changes) => {
    const normalized = { ...changes };
    if (normalized.firstName !== undefined) normalized.firstName = normalized.firstName.trim();
    if (normalized.lastName !== undefined) normalized.lastName = normalized.lastName.trim();
    if (normalized.phone !== undefined) normalized.phone = normalized.phone.trim();
    if (normalized.joiningDate !== undefined) normalized.joiningDate = new Date(normalized.joiningDate);
    if (normalized.shift === "") normalized.shift = null;
    if (normalized.reportingManager === "") normalized.reportingManager = null;
    return normalized;
};

const validateReferences = async (employee, changes) => {
    const departmentId = changes.department || employee.department;
    const designationId = changes.designation || employee.designation;
    const [department, designation] = await Promise.all([
        Department.findById(departmentId),
        Designation.findById(designationId)
    ]);
    if (!department || !designation || !department.isActive || !designation.isActive) {
        return "Selected department or designation is invalid or inactive";
    }
    if (designation.department.toString() !== department._id.toString()) {
        return "Designation does not belong to selected department";
    }
    if (changes.shift && !(await Shift.exists({ _id: changes.shift, isActive: true }))) {
        return "Selected shift is invalid or inactive";
    }
    if (changes.reportingManager) {
        if (changes.reportingManager.toString() === employee._id.toString()) {
            return "Employee cannot report to themselves";
        }
        const managerUser = await User.findOne({
            employee: changes.reportingManager, role: "manager", isActive: true
        });
        const managerEmployee = managerUser
            ? await Employee.findOne({ _id: changes.reportingManager, employmentStatus: "active" })
            : null;
        if (!managerEmployee) return "Selected reporting manager is not an active manager";
    }
    return null;
};

export const createEmployeeUpdateProposal = async (req, res) => {
    try {
        const { employeeId, source, sourceReference = "", sourceSubject = "", proposedChanges } = req.body;
        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({ success: false, message: "Valid employeeId is required" });
        }
        if (!["gmail", "document", "manual"].includes(source)) {
            return res.status(400).json({ success: false, message: "Invalid proposal source" });
        }
        const validationError = validateProposal(proposedChanges);
        if (validationError) return res.status(400).json({ success: false, message: validationError });

        const employee = await Employee.findById(employeeId).select("employeeCode");
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        const proposal = await EmployeeUpdateApproval.create({
            employee: employee._id,
            employeeCode: employee.employeeCode,
            source,
            sourceReference: String(sourceReference).slice(0, 500),
            sourceSubject: String(sourceSubject).slice(0, 300),
            proposedChanges: normalizeChanges(proposedChanges),
            requestedBy: req.user.userId
        });
        return res.status(201).json({
            success: true,
            message: "Employee update sent for HR/Admin approval",
            data: proposal
        });
    } catch (error) {
        console.error("Create employee update proposal failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not create approval request" });
    }
};

export const getEmployeeUpdateProposals = async (req, res) => {
    try {
        const status = typeof req.query.status === "string" ? req.query.status : "pending";
        if (!["pending", "approved", "rejected", "all"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status filter" });
        }
        const filter = status === "all" ? {} : { status };
        const data = await EmployeeUpdateApproval.find(filter)
            .populate("employee", "employeeCode firstName lastName")
            .populate("requestedBy", "email role")
            .populate("decidedBy", "email role")
            .sort({ createdAt: -1 })
            .limit(200);
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Load employee update proposals failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not load approval requests" });
    }
};

export const decideEmployeeUpdateProposal = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, note = "" } = req.body;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid request ID" });
        if (!["approve", "reject"].includes(decision)) {
            return res.status(400).json({ success: false, message: "Decision must be approve or reject" });
        }
        if (typeof note !== "string" || note.length > 1000) {
            return res.status(400).json({ success: false, message: "Decision note must be under 1000 characters" });
        }

        const proposal = await EmployeeUpdateApproval.findOne({ _id: id, status: "pending" });
        if (!proposal) return res.status(404).json({ success: false, message: "Pending approval request not found or already decided" });

        if (decision === "reject") {
            const rejected = await EmployeeUpdateApproval.findOneAndUpdate(
                { _id: id, status: "pending" },
                { $set: { status: "rejected", decidedBy: req.user.userId, decidedAt: new Date(), decisionNote: note.trim() } },
                { new: true }
            );
            if (!rejected) return res.status(409).json({ success: false, message: "This request was already decided" });
            return res.status(200).json({ success: true, message: "Proposal rejected", data: rejected });
        }

        const changes = normalizeChanges(proposal.proposedChanges || {});
        const validationError = validateProposal(changes);
        if (validationError) return res.status(400).json({ success: false, message: validationError });
        const employee = await Employee.findById(proposal.employee);
        if (!employee) return res.status(404).json({ success: false, message: "Employee no longer exists" });
        const referenceError = await validateReferences(employee, changes);
        if (referenceError) return res.status(400).json({ success: false, message: referenceError });

        const oldValues = {};
        for (const field of Object.keys(changes)) oldValues[field] = employee[field] ?? null;

        // Atomically claim the pending request so HR and Admin cannot both apply it.
        const claimed = await EmployeeUpdateApproval.findOneAndUpdate(
            { _id: id, status: "pending" },
            { $set: { status: "approved", decidedBy: req.user.userId, decidedAt: new Date(), decisionNote: note.trim(), oldValues, appliedValues: changes } },
            { new: true }
        );
        if (!claimed) return res.status(409).json({ success: false, message: "This request was already decided" });

        try {
            Object.assign(employee, changes);
            await employee.save();
        } catch (applyError) {
            await EmployeeUpdateApproval.updateOne(
                { _id: id, status: "approved", decidedBy: req.user.userId },
                { $set: { status: "pending", decidedBy: null, decidedAt: null, decisionNote: "", oldValues: null, appliedValues: null } }
            );
            throw applyError;
        }

        return res.status(200).json({ success: true, message: "Proposal approved and employee record updated", data: claimed });
    } catch (error) {
        console.error("Decide employee update proposal failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not process approval decision" });
    }
};
