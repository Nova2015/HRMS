import mongoose from "mongoose";
import EmployeeUpdateApproval from "../models/EmployeeUpdateApproval.js";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import Shift from "../models/Shift.js";
import User from "../models/User.js";
import { lockEmployeeReferences, lockReportingManager } from "../services/employeeReferenceGuards.js";
import { createsReportingCycle, hasDirectReports } from "../services/reportingHierarchy.js";

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

        const employee = await Employee.findById(employeeId);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });
        if (employee.isArchived) {
            return res.status(409).json({ success: false, message: "Archived employees cannot receive update proposals" });
        }

        const proposal = await EmployeeUpdateApproval.create({
            employee: employee._id,
            employeeCode: employee.employeeCode,
            source,
            sourceReference: String(sourceReference).slice(0, 500),
            sourceSubject: String(sourceSubject).slice(0, 300),
            proposedChanges: normalizeChanges(proposedChanges),
            oldValues: Object.fromEntries(Object.keys(proposedChanges).map((field) => [field, employee[field] ?? null])),
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
        if (decision === "reject" && !note.trim()) {
            return res.status(400).json({ success: false, message: "A decision reason is required when rejecting an employee update" });
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
        if (employee.isArchived) {
            return res.status(409).json({ success: false, message: "Archived employees cannot be changed through approval" });
        }
        const referenceError = await validateReferences(employee, changes);
        if (referenceError) return res.status(400).json({ success: false, message: referenceError });

        const oldValues = {};
        for (const field of Object.keys(changes)) oldValues[field] = employee[field] ?? null;

        // Apply the employee change and finalize its approval in one transaction.
        // Employment status changes must also synchronize the linked login account.
        const session = await mongoose.startSession();
        let claimed = null;
        try {
            await session.withTransaction(async () => {
                const currentEmployee = await Employee.findById(employee._id).session(session);
                if (!currentEmployee) {
                    const missingError = new Error("Employee no longer exists");
                    missingError.statusCode = 404;
                    throw missingError;
                }
                if (currentEmployee.isArchived) {
                    const archivedError = new Error("Archived employees cannot be changed through approval");
                    archivedError.statusCode = 409;
                    throw archivedError;
                }

                await lockEmployeeReferences({
                    departmentId: changes.department || currentEmployee.department,
                    designationId: changes.designation || currentEmployee.designation,
                    shiftId: changes.shift !== undefined ? changes.shift : currentEmployee.shift,
                    session
                });
                if (changes.reportingManager) {
                    await lockReportingManager(changes.reportingManager, session);
                    const managerUser = await User.findOne({
                        employee: changes.reportingManager, role: "manager", isActive: true
                    }).session(session);
                    if (!managerUser || await createsReportingCycle(currentEmployee._id, changes.reportingManager, session)) {
                        const invalidManager = new Error("Selected reporting manager is invalid or would create a circular hierarchy");
                        invalidManager.statusCode = 409;
                        throw invalidManager;
                    }
                }
                const transactionOldValues = {};
                for (const field of Object.keys(changes)) {
                    transactionOldValues[field] = currentEmployee[field] ?? null;
                }

                claimed = await EmployeeUpdateApproval.findOneAndUpdate(
                    { _id: id, status: "pending" },
                    { $set: {
                        status: "approved",
                        decidedBy: req.user.userId,
                        decidedAt: new Date(),
                        decisionNote: note.trim(),
                        oldValues: transactionOldValues,
                        appliedValues: changes
                    } },
                    { new: true, session }
                );
                if (!claimed) {
                    const conflictError = new Error("This request was already decided");
                    conflictError.statusCode = 409;
                    throw conflictError;
                }

                if (changes.employmentStatus && changes.employmentStatus !== "active" && await hasDirectReports(currentEmployee._id, session)) {
                    const assignedReports = new Error("Reassign all employees reporting to this manager before changing employment status");
                    assignedReports.statusCode = 409;
                    throw assignedReports;
                }
                Object.assign(currentEmployee, changes);
                await currentEmployee.save({ session });

                if (changes.employmentStatus !== undefined) {
                    const userUpdate = { isActive: changes.employmentStatus === "active" };
                    if (changes.employmentStatus !== "active") {
                        userUpdate.tokenVersion = (await User.findOne({ employee: currentEmployee._id }).session(session))?.tokenVersion + 1;
                        if (!Number.isFinite(userUpdate.tokenVersion)) {
                            const missingUserError = new Error("Employee login account is missing");
                            missingUserError.statusCode = 409;
                            throw missingUserError;
                        }
                    }
                    const linkedUser = await User.findOneAndUpdate(
                        { employee: currentEmployee._id },
                        { $set: userUpdate },
                        { new: true, runValidators: true, session }
                    );
                    if (!linkedUser) {
                        const missingUserError = new Error("Employee login account is missing");
                        missingUserError.statusCode = 409;
                        throw missingUserError;
                    }
                }
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({ success: true, message: "Proposal approved and employee record updated", data: claimed });
    } catch (error) {
        console.error("Decide employee update proposal failed:", error.message);
        const statusCode = [404, 409].includes(error.statusCode)
            ? error.statusCode
            : error.code === 11000 ? 409
            : error.hasErrorLabel?.("TransientTransactionError") ||
              error.hasErrorLabel?.("UnknownTransactionCommitResult") ||
              /transaction numbers are only allowed|replica set|mongos/i.test(error.message || "")
                ? 503
                : 500;
        return res.status(statusCode).json({
            success: false,
            message: statusCode === 404 ? "Employee no longer exists"
                : statusCode === 409 ? "This request was already decided or its login account is missing"
                : statusCode === 503 ? "Approval is temporarily unavailable; please retry"
                : "Could not process approval decision"
        });
    }
};


export const createApprovalTestFixture = async (req, res) => {
    let testEmployee = null;
    try {
        if (process.env.NODE_ENV === "production") {
            return res.status(404).json({ success: false, message: "Not found" });
        }

        const designation = await Designation.findOne({ isActive: true }).sort({ createdAt: 1 });
        if (!designation) {
            return res.status(409).json({ success: false, message: "No active designation is available for a test fixture" });
        }
        const department = await Department.findOne({
            _id: designation.department,
            isActive: true
        });
        if (!department) {
            return res.status(409).json({ success: false, message: "No active department/designation pair is available" });
        }

        const stamp = Date.now();
        testEmployee = await Employee.create({
            employeeCode: `TEST-${stamp}`,
            firstName: "Approval",
            lastName: "Test",
            email: `approval-test-${stamp}@example.invalid`,
            phone: "0000000000",
            department: department._id,
            designation: designation._id,
            joiningDate: new Date(),
            employmentStatus: "inactive",
            isTestRecord: true
        });

        const proposals = await EmployeeUpdateApproval.create([
            {
                employee: testEmployee._id,
                employeeCode: testEmployee.employeeCode,
                source: "manual",
                sourceReference: "test-fixture",
                sourceSubject: "TEST ONLY - Approve this sample",
                proposedChanges: { firstName: "ApprovalPassed" },
                oldValues: { firstName: testEmployee.firstName },
                requestedBy: req.user.userId
            },
            {
                employee: testEmployee._id,
                employeeCode: testEmployee.employeeCode,
                source: "manual",
                sourceReference: "test-fixture",
                sourceSubject: "TEST ONLY - Reject this sample",
                proposedChanges: { phone: "9990000000" },
                oldValues: { phone: testEmployee.phone },
                requestedBy: req.user.userId
            }
        ]);

        return res.status(201).json({
            success: true,
            message: "Isolated test employee and two test proposals created. No login account or appointment letter was created.",
            data: {
                employeeId: testEmployee._id,
                employeeCode: testEmployee.employeeCode,
                proposalIds: proposals.map((proposal) => proposal._id)
            }
        });
    } catch (error) {
        if (testEmployee) {
            await EmployeeUpdateApproval.deleteMany({ employee: testEmployee._id }).catch(() => {});
            await Employee.deleteOne({ _id: testEmployee._id, isTestRecord: true }).catch(() => {});
        }
        console.error("Create approval test fixture failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not create approval test fixture" });
    }
};

export const deleteApprovalTestFixture = async (req, res) => {
    try {
        if (process.env.NODE_ENV === "production") {
            return res.status(404).json({ success: false, message: "Not found" });
        }
        const { employeeId } = req.params;
        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid test employee ID" });
        }
        const testEmployee = await Employee.findOne({
            _id: employeeId,
            isTestRecord: true
        }).select("+isTestRecord");
        if (!testEmployee) {
            return res.status(404).json({ success: false, message: "Test employee not found" });
        }
        if (await User.exists({ employee: testEmployee._id })) {
            return res.status(409).json({ success: false, message: "Test employee has a linked login account; cleanup stopped" });
        }

        await EmployeeUpdateApproval.deleteMany({ employee: testEmployee._id });
        await Employee.deleteOne({ _id: testEmployee._id, isTestRecord: true });
        return res.status(200).json({
            success: true,
            message: "Test employee and its approval proposals were deleted"
        });
    } catch (error) {
        console.error("Delete approval test fixture failed:", error.message);
        return res.status(500).json({ success: false, message: "Could not delete approval test fixture" });
    }
};
