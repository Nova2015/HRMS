
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Employee from "../models/Employee.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import Shift from "../models/Shift.js";

const ALLOWED_ROLES = ["employee", "manager", "hr"];
const ALLOWED_STATUSES = ["active", "inactive", "resigned", "terminated"];

const populateEmployee = (query) => {
    return query
        .populate("department", "name code")
        .populate("designation", "name")
        .populate("shift", "name code startTime endTime gracePeriodMinutes");
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
            designation,
            joiningDate,
            shift = null,
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

        if (String(initialPassword).length < 12) {
            return res.status(400).json({
                success: false,
                message: "Initial password must contain at least 12 characters"
            });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee role"
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

        if (shift && (!mongoose.isValidObjectId(shift) || !(await Shift.exists({ _id: shift, isActive: true })))) {
            return res.status(400).json({ success: false, message: "Selected shift is invalid or inactive" });
        }

        // Create employee record
        createdEmployee = await Employee.create({
            employeeCode: normalizedCode,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail,
            phone: phone || "",
            department,
            designation,
            shift,
            joiningDate,
            employmentStatus: "active"
        });

        // Hash password before creating login account
        const passwordHash = await bcrypt.hash(initialPassword, 12);

        createdUser = await User.create({
            employee: createdEmployee._id,
            email: normalizedEmail,
            passwordHash,
            role,
            isActive: true
        });

        const employeeData = await populateEmployee(
            Employee.findById(createdEmployee._id)
        );

        return res.status(201).json({
            success: true,
            message: "Employee and login account created successfully",
            data: attachAccount(employeeData, createdUser)
        });

    } catch (error) {
        // Roll back records if account creation or later processing fails
        if (createdUser) {
            await User.findByIdAndDelete(createdUser._id).catch(() => {});
        }

        if (createdEmployee) {
            await Employee.findByIdAndDelete(createdEmployee._id).catch(() => {});
        }

        console.error("Create employee error:", error);

        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000
                ? "Employee code or email already exists"
                : error.message
        });
    }
};

// GET ALL EMPLOYEES
export const getEmployees = async (req, res) => {
    try {
        const employees = await populateEmployee(
            Employee.find().sort({ createdAt: -1 })
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
            message: error.message
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

        const employee = await populateEmployee(Employee.findById(id));

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
            message: error.message
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

        const allowedFields = [
            "firstName",
            "lastName",
            "email",
            "phone",
            "department",
            "designation",
            "shift",
            "joiningDate",
            "employmentStatus"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
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

        if (
            updates.employmentStatus !== undefined &&
            !ALLOWED_STATUSES.includes(updates.employmentStatus)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid employment status"
            });
        }

        Object.assign(employee, updates);
        await employee.save();

        const userUpdate = {};

        if (updates.email !== undefined) {
            userUpdate.email = updates.email;
        }

        if (updates.employmentStatus !== undefined) {
            userUpdate.isActive = updates.employmentStatus === "active";
        }

        if (Object.keys(userUpdate).length > 0) {
            await User.findOneAndUpdate(
                { employee: employee._id },
                { $set: userUpdate },
                { runValidators: true }
            );
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

        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.code === 11000
                ? "Employee email already exists"
                : error.message
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

        const employee = await Employee.findById(id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        employee.employmentStatus = "inactive";
        await employee.save();

        await User.findOneAndUpdate(
            { employee: employee._id },
            { $set: { isActive: false } }
        );

        return res.status(200).json({
            success: true,
            message: "Employee and login account deactivated successfully"
        });

    } catch (error) {
        console.error("Deactivate employee error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
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

        const employee = await Employee.findById(id);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        employee.employmentStatus = "active";
        await employee.save();

        await User.findOneAndUpdate(
            { employee: employee._id },
            { $set: { isActive: true } }
        );

        return res.status(200).json({
            success: true,
            message: "Employee and login account activated successfully"
        });

    } catch (error) {
        console.error("Activate employee error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
