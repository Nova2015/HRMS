
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Employee from "../models/Employee.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import Shift from "../models/Shift.js";
import Team from "../models/Team.js";
import { createsReportingCycle, hasDirectReports } from "../services/reportingHierarchy.js";
import { generateAppointmentLetterDocument } from "../services/employeeDocumentGenerator.js";
import { isTransactionUnavailable } from "../utils/isTransactionUnavailable.js";
import { lockEmployeeReferences, lockReportingManager } from "../services/employeeReferenceGuards.js";

const ALLOWED_ROLES = ["employee", "manager", "hr", "admin"];
const ALLOWED_STATUSES = ["active", "inactive", "resigned", "terminated"];

const populateEmployee = (query) => {
    return query
        .populate("department", "name code")
        .populate("team", "name code department isActive")
        .populate("designation", "name")
        .populate("shift", "name code startTime endTime gracePeriodMinutes")
        .populate("reportingManager", "employeeCode firstName lastName");
};

const attachAccount = (employee, user) => {
    const data = employee.toObject();

    data.account = user
        ? {
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            lastLogin: user.lastLogin
        }
        : null;

    return data;
};

// CREATE EMPLOYEE + LOGIN ACCOUNT
export const createEmployee = async (req, res) => {
    let createdEmployee = null;
    let createdUser = null;

    try {
        const {
            employeeCode,
            firstName,
            lastName,
            email,
            phone,
            department,
            team = null,
            designation,
            joiningDate,
            shift = null,
            reportingManager = null,
            role = "employee",
            initialPassword
        } = req.body;

        if (
            !employeeCode ||
            !firstName ||
            !lastName ||
            !email ||
            !department ||
            !designation ||
            !joiningDate ||
            !initialPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required employee details and initial password"
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCode = String(employeeCode).trim().toUpperCase();

        if (String(initialPassword).length < 12 || Buffer.byteLength(String(initialPassword), "utf8") > 72) {
            return res.status(400).json({
                success: false,
                message: "Initial password must contain at least 12 characters and no more than 72 UTF-8 bytes"
            });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee role"
            });
        }

        if (role === "admin" && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only an Admin can create another Admin account"
            });
        }

        if (
            !mongoose.isValidObjectId(department) ||
            !mongoose.isValidObjectId(designation)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid department or designation ID"
            });
        }

        const [existingCode, existingEmail] = await Promise.all([
            Employee.findOne({ employeeCode: normalizedCode }),
            User.findOne({ email: normalizedEmail })
        ]);

        if (existingCode) {
            return res.status(409).json({
                success: false,
                message: "Employee code already exists"
            });
        }

        if (existingEmail) {
            return res.status(409).json({
                success: false,
                message: "Login email already exists"
            });
        }

        const [departmentExists, designationExists] = await Promise.all([
            Department.findById(department),
            Designation.findById(designation)
        ]);

        if (!departmentExists || !designationExists) {
            return res.status(404).json({
                success: false,
                message: "Department or designation not found"
            });
        }

        if (!departmentExists.isActive || !designationExists.isActive) {
            return res.status(400).json({
                success: false,
                message: "Selected department or designation is inactive"
            });
        }

        if (designationExists.department.toString() !== department.toString()) {
            return res.status(400).json({
                success: false,
                message: "Designation does not belong to selected department"
            });
        }

        if (team) {
            if (!mongoose.isValidObjectId(team)) return res.status(400).json({ success: false, message: "Invalid team ID" });
            const selectedTeam = await Team.findOne({ _id: team, department, isActive: true });
            if (!selectedTeam) return res.status(400).json({ success: false, message: "Selected team must be active and belong to the selected department" });
        }

        if (shift && (!mongoose.isValidObjectId(shift) || !(await Shift.exists({ _id: shift, isActive: true })))) {
            return res.status(400).json({ success: false, message: "Selected shift is invalid or inactive" });
        }

        if (reportingManager) {
            if (!mongoose.isValidObjectId(reportingManager)) {
                return res.status(400).json({ success: false, message: "Invalid reporting manager" });
            }
            const managerUser = await User.findOne({
                employee: reportingManager,
                role: "manager",
                isActive: true
            });
            const managerEmployee = managerUser
                ? await Employee.findOne({ _id: reportingManager, employmentStatus: "active" })
                : null;
            if (!managerEmployee) {
                return res.status(400).json({ success: false, message: "Select an active employee with Manager role" });
            }
        }

        // Hash the password before opening the database transaction.
        const passwordHash = await bcrypt.hash(initialPassword, 12);

        // Employee profile and login account must either both exist or neither exist.
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await lockEmployeeReferences({ departmentId: department, designationId: designation, shiftId: shift, teamId: team, session });
                if (reportingManager) {
                    await lockReportingManager(reportingManager, session);
                    const managerUser = await User.findOne({ employee: reportingManager, role: "manager", isActive: true }).session(session);
                    if (!managerUser) {
                        const invalidManager = new Error("Select an active employee with Manager role");
                        invalidManager.code = "MANAGER_INACTIVE";
                        throw invalidManager;
                    }
                }
                createdEmployee = new Employee({
                    employeeCode: normalizedCode,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    email: normalizedEmail,
                    phone: phone || "",
                    department,
                    team: team || null,
                    designation,
                    shift,
                    reportingManager: reportingManager || null,
                    joiningDate,
                    employmentStatus: "active"
                });
                await createdEmployee.save({ session });

                createdUser = new User({
                    employee: createdEmployee._id,
                    email: normalizedEmail,
                    passwordHash,
                    role,
                    isActive: true
                });
                await createdUser.save({ session });
            });
        } finally {
            await session.endSession();
        }

        const employeeData = await populateEmployee(
            Employee.findById(createdEmployee._id)
        );

        let generatedDocument = null;
        let documentWarning = "";
        try {
            generatedDocument = await generateAppointmentLetterDocument(
                employeeData,
                req.user.userId
            );
        } catch (documentError) {
            documentWarning = ". Appointment letter generation failed; HR should issue it from the Documents module";
            console.error("Automatic appointment letter generation failed:", documentError.message);
        }

        return res.status(201).json({
            success: true,
            message: "Employee and login account created successfully" + documentWarning,
            data: attachAccount(employeeData, createdUser),
            generatedDocument
        });

    } catch (error) {
        console.error("Create employee error:", error);

        const isConflict = error.code === 11000;
        const isTransactionFailure = isTransactionUnavailable(error);
        return res.status(isConflict ? 409 : isTransactionFailure ? 503 : 400).json({
            success: false,
            message: isConflict
                ? "Employee code or email already exists"
                : isTransactionFailure
                    ? "Employee creation is temporarily unavailable; please retry"
                    : "Unable to create employee"
        });
    }
};

// GET ALL EMPLOYEES
export const getEmployees = async (req, res) => {
    try {
        const employees = await populateEmployee(
            Employee.find({ isTestRecord: { $ne: true }, isArchived: { $ne: true } }).sort({ createdAt: -1 })
        );

        const employeeIds = employees.map((employee) => employee._id);

        const users = await User.find({
            employee: { $in: employeeIds }
        }).select("employee email role isActive lastLogin");

        const userMap = new Map(
            users.map((user) => [user.employee.toString(), user])
        );

        const data = employees.map((employee) =>
            attachAccount(
                employee,
                userMap.get(employee._id.toString()) || null
            )
        );

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        console.error("Get employees error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load employees"
        });
    }
};

// GET EMPLOYEE BY ID
export const getEmployeeById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const employee = await populateEmployee(Employee.findOne({ _id: id, isTestRecord: { $ne: true } }));

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const user = await User.findOne({
            employee: employee._id
        }).select("employee email role isActive lastLogin");

        return res.status(200).json({
            success: true,
            data: attachAccount(employee, user)
        });

    } catch (error) {
        console.error("Get employee error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load employee"
        });
    }
};

// UPDATE EMPLOYEE
export const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const employee = await Employee.findById(id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }
        if (employee.isArchived) {
            return res.status(409).json({
                success: false,
                message: "Archived employees cannot be edited or reactivated"
            });
        }
        if (
            ["resigned", "terminated"].includes(employee.employmentStatus) &&
            req.body.employmentStatus !== undefined &&
            req.body.employmentStatus !== employee.employmentStatus
        ) {
            return res.status(409).json({
                success: false,
                message: "Employment status cannot be changed after resignation or termination"
            });
        }

        const linkedUser = await User.findOne({ employee: employee._id });
        if (!linkedUser) {
            return res.status(409).json({
                success: false,
                message: "Employee login account is missing; contact system administrator"
            });
        }

        const allowedFields = [
            "employeeCode",
            "firstName",
            "lastName",
            "email",
            "phone",
            "department",
            "team",
            "designation",
            "shift",
            "reportingManager",
            "joiningDate",
            "employmentStatus"
        ];

        const requestedRole = req.body.role;
        if (
            requestedRole !== undefined &&
            !ALLOWED_ROLES.includes(String(requestedRole).trim().toLowerCase())
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid account role"
            });
        }

        if (
            requestedRole !== undefined &&
            req.user.role !== "admin" &&
            (String(requestedRole).trim().toLowerCase() === "admin" || linkedUser.role === "admin")
        ) {
            return res.status(403).json({
                success: false,
                message: "Only an Admin can assign or change an Admin account role"
            });
        }

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0 && requestedRole === undefined) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }

        if (updates.employeeCode !== undefined) {
            updates.employeeCode = String(updates.employeeCode).trim().toUpperCase();
            if (!updates.employeeCode) {
                return res.status(400).json({ success: false, message: "Employee ID is required" });
            }
            const duplicateCode = await Employee.findOne({ employeeCode: updates.employeeCode, _id: { $ne: employee._id } });
            if (duplicateCode) {
                return res.status(409).json({ success: false, message: "Employee ID already exists" });
            }
        }

        if (updates.email !== undefined) {
            updates.email = String(updates.email).trim().toLowerCase();

            const duplicateUser = await User.findOne({
                email: updates.email,
                employee: { $ne: employee._id }
            });

            if (duplicateUser) {
                return res.status(409).json({
                    success: false,
                    message: "Email is already linked to another login account"
                });
            }
        }

        if (updates.firstName !== undefined) {
            updates.firstName = String(updates.firstName).trim();
        }

        if (updates.lastName !== undefined) {
            updates.lastName = String(updates.lastName).trim();
        }

        if (updates.shift !== undefined && updates.shift !== null &&
            (!mongoose.isValidObjectId(updates.shift) || !(await Shift.exists({ _id: updates.shift, isActive: true })))) {
            return res.status(400).json({ success: false, message: "Selected shift is invalid or inactive" });
        }

        if (updates.reportingManager !== undefined) {
            if (updates.reportingManager === null || updates.reportingManager === "") {
                updates.reportingManager = null;
            } else {
                if (!mongoose.isValidObjectId(updates.reportingManager) ||
                    updates.reportingManager.toString() === employee._id.toString()) {
                    return res.status(400).json({ success: false, message: "Invalid reporting manager" });
                }
                const managerUser = await User.findOne({
                    employee: updates.reportingManager,
                    role: "manager",
                    isActive: true
                });
                const managerEmployee = managerUser
                    ? await Employee.findOne({
                        _id: updates.reportingManager,
                        employmentStatus: "active"
                    })
                    : null;
                if (!managerEmployee) {
                    return res.status(400).json({ success: false, message: "Select an active employee with Manager role" });
                }
                if (await createsReportingCycle(employee._id, updates.reportingManager)) {
                    return res.status(400).json({
                        success: false,
                        message: "Reporting manager assignment would create a circular reporting hierarchy"
                    });
                }
            }
        }

        const departmentId = updates.department || employee.department.toString();
        const designationId = updates.designation || employee.designation.toString();

        if (
            !mongoose.isValidObjectId(departmentId) ||
            !mongoose.isValidObjectId(designationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid department or designation ID"
            });
        }

        const [departmentExists, designationExists] = await Promise.all([
            Department.findById(departmentId),
            Designation.findById(designationId)
        ]);

        if (!departmentExists || !designationExists) {
            return res.status(404).json({
                success: false,
                message: "Department or designation not found"
            });
        }

        if (!departmentExists.isActive || !designationExists.isActive) {
            return res.status(400).json({
                success: false,
                message: "Selected department or designation is inactive"
            });
        }

        if (designationExists.department.toString() !== departmentId.toString()) {
            return res.status(400).json({
                success: false,
                message: "Designation does not belong to selected department"
            });
        }

        const teamId = updates.team !== undefined ? updates.team : employee.team;
        if (teamId) {
            if (!mongoose.isValidObjectId(teamId)) return res.status(400).json({ success: false, message: "Invalid team ID" });
            const selectedTeam = await Team.findOne({ _id: teamId, department: departmentId, isActive: true });
            if (!selectedTeam) return res.status(400).json({ success: false, message: "Selected team must be active and belong to the selected department" });
        } else {
            updates.team = null;
        }

        if (
            updates.employmentStatus !== undefined &&
            !ALLOWED_STATUSES.includes(updates.employmentStatus)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid employment status"
            });
        }

        const userUpdate = {};

        if (requestedRole !== undefined) {
            userUpdate.role = String(requestedRole).trim().toLowerCase();
        }

        if (updates.email !== undefined) {
            userUpdate.email = updates.email;
        }

        if (updates.employmentStatus !== undefined) {
            userUpdate.isActive = updates.employmentStatus === "active";
            // Invalidate existing sessions when an account is closed/inactivated.
            // Keep the increment permanent so reactivation cannot revive old tokens.
            if (updates.employmentStatus !== "active" && linkedUser.isActive) {
                userUpdate.tokenVersion = (linkedUser.tokenVersion || 0) + 1;
            }
        }

        // Keep the employee profile and linked login account in one MongoDB transaction.
        // Atlas replica-set deployments support multi-document transactions.
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await lockEmployeeReferences({
                    departmentId: updates.department || employee.department,
                    designationId: updates.designation || employee.designation,
                    shiftId: updates.shift !== undefined ? updates.shift : employee.shift,
                    teamId,
                    session
                });
                if (updates.reportingManager) {
                    await lockReportingManager(updates.reportingManager, session);
                    const managerUser = await User.findOne({ employee: updates.reportingManager, role: "manager", isActive: true }).session(session);
                    if (!managerUser || await createsReportingCycle(employee._id, updates.reportingManager, session)) {
                        const invalidManager = new Error("Reporting manager assignment is invalid or circular");
                        invalidManager.code = "MANAGER_INACTIVE";
                        throw invalidManager;
                    }
                }
                const nextRole = requestedRole === undefined
                    ? linkedUser.role
                    : String(requestedRole).trim().toLowerCase();
                const nextStatus = updates.employmentStatus === undefined
                    ? employee.employmentStatus
                    : updates.employmentStatus;
                const managerEligibilityChanged =
                    (requestedRole !== undefined && nextRole !== linkedUser.role) ||
                    (updates.employmentStatus !== undefined && nextStatus !== employee.employmentStatus);
                const managerWillBecomeUnavailable =
                    managerEligibilityChanged &&
                    (nextRole !== "manager" || nextStatus !== "active");

                if (managerWillBecomeUnavailable && await hasDirectReports(employee._id, session)) {
                    const assignedReports = new Error("Reassign all employees reporting to this manager before changing their role or employment status");
                    assignedReports.code = 40902;
                    throw assignedReports;
                }

                Object.assign(employee, updates);
                await employee.save({ session });

                if (Object.keys(userUpdate).length > 0) {
                    const syncedUser = await User.findOneAndUpdate(
                        { employee: employee._id },
                        { $set: userUpdate },
                        { new: true, runValidators: true, session }
                    );
                    if (!syncedUser) {
                        const syncError = new Error("Employee login account could not be synchronized");
                        syncError.code = 40901;
                        throw syncError;
                    }
                }
            });
        } finally {
            await session.endSession();
        }

        const updatedEmployee = await populateEmployee(
            Employee.findById(employee._id)
        );

        const user = await User.findOne({
            employee: employee._id
        }).select("employee email role isActive lastLogin");

        return res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: attachAccount(updatedEmployee, user)
        });

    } catch (error) {
        console.error("Update employee error:", error);

        const isConflict = error.code === 11000 || error.code === 40901 || error.code === 40902;
        const isTransactionFailure = isTransactionUnavailable(error);
        return res.status(isConflict ? 409 : isTransactionFailure ? 503 : 400).json({
            success: false,
            message: error.code === 11000
                ? "Employee email already exists"
                : error.code === 40901
                    ? "Employee login account could not be synchronized"
                    : error.code === 40902
                        ? "Reassign all employees reporting to this manager before changing their role or employment status"
                        : isTransactionFailure
                        ? "Employee update could not be completed safely. Please retry."
                        : "Unable to update employee"
        });
    }
};

// SOFT DELETE / ARCHIVE EMPLOYEE WITHOUT DELETING HR HISTORY
export const archiveEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID" });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const employee = await Employee.findOne({
                    _id: id,
                    isArchived: { $ne: true }
                }).session(session);
                if (!employee) {
                    const notFound = new Error("Active employee record not found");
                    notFound.code = 40401;
                    throw notFound;
                }
                if (await hasDirectReports(employee._id, session)) {
                    const assignedReports = new Error("Reassign all employees reporting to this manager before archiving");
                    assignedReports.code = 40902;
                    throw assignedReports;
                }

                const linkedUser = await User.findOneAndUpdate(
                    { employee: employee._id },
                    {
                        $set: { isActive: false },
                        $inc: { tokenVersion: 1 }
                    },
                    { new: true, session }
                );
                if (!linkedUser) {
                    const missingAccount = new Error("Employee login account is missing");
                    missingAccount.code = 40901;
                    throw missingAccount;
                }

                employee.isArchived = true;
                employee.archivedAt = new Date();
                employee.archivedBy = req.user.userId;
                employee.employmentStatus = "inactive";
                await employee.save({ session });
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({
            success: true,
            message: "Employee archived. Login disabled; historical records retained."
        });
    } catch (error) {
        console.error("Archive employee error:", error);
        const status = error.code === 40401 ? 404 : [40901, 40902].includes(error.code) ? 409 : isTransactionUnavailable(error) ? 503 : 500;
        return res.status(status).json({
            success: false,
            message: error.code === 40401
                ? "Active employee record not found"
                : error.code === 40901
                    ? "Employee login account is missing; cannot safely archive employee"
                    : error.code === 40902
                        ? "Reassign all employees reporting to this manager before archiving"
                        : isTransactionUnavailable(error)
                            ? "Employee archiving is temporarily unavailable; please retry"
                            : "Unable to archive employee"
        });
    }
};

// DEACTIVATE EMPLOYEE + LOGIN ACCOUNT
export const deactivateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const employee = await Employee.findById(id).session(session);
                if (!employee) {
                    const notFound = new Error("Employee not found");
                    notFound.code = 40401;
                    throw notFound;
                }
                if (await hasDirectReports(employee._id, session)) {
                    const assignedReports = new Error("Reassign all employees reporting to this manager before deactivation");
                    assignedReports.code = 40902;
                    throw assignedReports;
                }

                const linkedUser = await User.findOneAndUpdate(
                    { employee: employee._id },
                    {
                        $set: { isActive: false },
                        $inc: { tokenVersion: 1 }
                    },
                    { new: true, session }
                );
                if (!linkedUser) {
                    const missingAccount = new Error("Employee login account is missing");
                    missingAccount.code = 40901;
                    throw missingAccount;
                }

                employee.employmentStatus = "inactive";
                await employee.save({ session });
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({
            success: true,
            message: "Employee and login account deactivated successfully"
        });
    } catch (error) {
        console.error("Deactivate employee error:", error);
        const status = error.code === 40401 ? 404 : [40901, 40902].includes(error.code) ? 409 : isTransactionUnavailable(error) ? 503 : 500;
        return res.status(status).json({
            success: false,
            message: error.code === 40401
                ? "Employee not found"
                : error.code === 40901
                    ? "Employee login account is missing; cannot safely deactivate employee"
                    : error.code === 40902
                        ? "Reassign all employees reporting to this manager before deactivation"
                        : isTransactionUnavailable(error)
                            ? "Employee deactivation is temporarily unavailable; please retry"
                            : "Unable to deactivate employee"
        });
    }
};

// ACTIVATE EMPLOYEE + LOGIN ACCOUNT
export const activateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const employee = await Employee.findById(id).session(session);
                if (!employee) {
                    const notFound = new Error("Employee not found");
                    notFound.code = 40401;
                    throw notFound;
                }
                if (employee.isArchived) {
                    const archived = new Error("Archived employees cannot be reactivated");
                    archived.code = 40902;
                    throw archived;
                }
                if (["resigned", "terminated"].includes(employee.employmentStatus)) {
                    const employmentEnded = new Error("Resigned or terminated employees cannot be reactivated");
                    employmentEnded.code = 40903;
                    throw employmentEnded;
                }

                if (employee.department && employee.designation) {
                    // Keep operations sequential within the MongoDB transaction session.
                    const department = await Department.findById(employee.department).session(session);
                    const designation = await Designation.findById(employee.designation).session(session);
                    if (
                        !department ||
                        !department.isActive ||
                        !designation ||
                        !designation.isActive ||
                        designation.department.toString() !== employee.department.toString()
                    ) {
                        const invalidOrganization = new Error("Employee department or designation is inactive or inconsistent");
                        invalidOrganization.code = 40904;
                        throw invalidOrganization;
                    }
                }

                if (employee.shift) {
                    const shift = await Shift.findById(employee.shift).session(session);
                    if (!shift || !shift.isActive) {
                        const invalidShift = new Error("Employee shift is inactive or unavailable");
                        invalidShift.code = 40905;
                        throw invalidShift;
                    }
                }

                if (employee.department && employee.designation) {
                    await lockEmployeeReferences({ departmentId: employee.department, designationId: employee.designation, shiftId: employee.shift, session });
                }

                const linkedUser = await User.findOneAndUpdate(
                    { employee: employee._id },
                    { $set: { isActive: true } },
                    { new: true, session }
                );
                if (!linkedUser) {
                    const missingAccount = new Error("Employee login account is missing");
                    missingAccount.code = 40901;
                    throw missingAccount;
                }

                employee.employmentStatus = "active";
                await employee.save({ session });
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({
            success: true,
            message: "Employee and login account activated successfully"
        });
    } catch (error) {
        console.error("Activate employee error:", error);
        const status = error.code === 40401 ? 404 : [40901, 40902, 40903, 40904, 40905].includes(error.code) || ["REFERENCE_INACTIVE", "REFERENCE_MISMATCH"].includes(error.code) ? 409 : isTransactionUnavailable(error) ? 503 : 500;
        return res.status(status).json({
            success: false,
            message: error.code === 40401
                ? "Employee not found"
                : error.code === 40901
                    ? "Employee login account is missing; cannot safely activate employee"
                    : error.code === 40902
                        ? "Archived employees cannot be reactivated. Restore the archive through an authorized process."
                        : error.code === 40903
                            ? "Resigned or terminated employees cannot be reactivated through this action"
                             : error.code === 40904
                                ? "Employee department or designation is inactive or inconsistent. Correct the assignment before reactivation."
                                : error.code === 40905
                                    ? "Employee shift is inactive or unavailable. Assign an active shift before reactivation."
                                    : ["REFERENCE_INACTIVE", "REFERENCE_MISMATCH"].includes(error.code)
                                        ? "Employee department, designation or shift changed during activation. Refresh and retry."
                                        : isTransactionUnavailable(error)
                                    ? "Employee activation is temporarily unavailable; please retry"
                                    : "Unable to activate employee"
        });
    }
};

// ADMIN RESET EMPLOYEE PASSWORD
export const resetEmployeePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body || {};

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee ID"
            });
        }

        if (
            typeof newPassword !== "string" ||
            newPassword.length < 12 ||
            Buffer.byteLength(newPassword, "utf8") > 72
        ) {
            return res.status(400).json({
                success: false,
                message: "Temporary password must be at least 12 characters and no more than 72 UTF-8 bytes"
            });
        }

        const employee = await Employee.findById(id).select("_id");
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const user = await User.findOne({ employee: employee._id }).select("+passwordHash");
        if (!user) {
            return res.status(409).json({
                success: false,
                message: "Employee login account is not linked"
            });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Employee password reset successfully. All existing sessions have been signed out."
        });
    } catch (error) {
        console.error("Admin reset employee password error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to reset employee password"
        });
    }
};
