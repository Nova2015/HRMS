import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import { decryptHrDetails, encryptHrDetails } from "../services/hrDetailsCrypto.js";

const SENSITIVE_FIELDS = [
    "bankName",
    "accountHolderName",
    "bankAccountNumber",
    "ifscCode",
    "panNumber",
    "pfNumber",
    "uanNumber"
];

const mask = (value, visible = 4) => {
    const clean = String(value || "");
    if (!clean) return "";
    return "*".repeat(Math.max(0, clean.length - visible)) + clean.slice(-visible);
};

const publicDetails = (employee, details) => ({
    dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.toISOString().slice(0, 10) : "",
    bankName: details.bankName || "",
    accountHolderName: details.accountHolderName || "",
    bankAccountNumberMasked: mask(details.bankAccountNumber),
    ifscCode: details.ifscCode ? mask(details.ifscCode, 4) : "",
    panNumberMasked: mask(details.panNumber, 4),
    pfNumberMasked: mask(details.pfNumber, 4),
    uanNumberMasked: mask(details.uanNumber, 4),
    hasBankAccountNumber: Boolean(details.bankAccountNumber),
    hasPanNumber: Boolean(details.panNumber),
    hasPfNumber: Boolean(details.pfNumber),
    hasUanNumber: Boolean(details.uanNumber)
});

const loadTarget = async (req, res) => {
    const isHr = ["admin", "hr"].includes(req.user.role);
    const employeeId = isHr && req.params.employeeId
        ? req.params.employeeId
        : req.user.employeeId;

    if (!mongoose.isValidObjectId(employeeId)) {
        res.status(400).json({ success: false, message: "Invalid employee ID" });
        return null;
    }
    if (!isHr && employeeId !== req.user.employeeId) {
        res.status(403).json({ success: false, message: "You can only access your own HR details" });
        return null;
    }
    const employee = await Employee.findById(employeeId).select("+hrDetailsEncrypted");
    if (!employee) {
        res.status(404).json({ success: false, message: "Employee not found" });
        return null;
    }
    return employee;
};

export const getEmployeeHrDetails = async (req, res) => {
    try {
        const employee = await loadTarget(req, res);
        if (!employee) return;
        const details = decryptHrDetails(employee.hrDetailsEncrypted);
        return res.status(200).json({ success: true, data: publicDetails(employee, details) });
    } catch (error) {
        if (error.code === "HR_ENCRYPTION_NOT_CONFIGURED") {
            return res.status(503).json({ success: false, message: "HR details encryption is not configured on the server" });
        }
        console.error("Get employee HR details failed:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load HR details" });
    }
};

export const updateEmployeeHrDetails = async (req, res) => {
    try {
        const employee = await loadTarget(req, res);
        if (!employee) return;

        const body = req.body || {};
        const allowed = new Set(["dateOfBirth", ...SENSITIVE_FIELDS]);
        const unknown = Object.keys(body).filter((key) => !allowed.has(key));
        if (unknown.length) {
            return res.status(400).json({ success: false, message: "Unsupported HR details field" });
        }

        let dob = employee.dateOfBirth;
        if (body.dateOfBirth !== undefined) {
            if (body.dateOfBirth === "") {
                dob = null;
            } else {
                if (typeof body.dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)) {
                    return res.status(400).json({ success: false, message: "Date of birth must use YYYY-MM-DD" });
                }
                const parsed = new Date(body.dateOfBirth + "T00:00:00.000Z");
                if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== body.dateOfBirth || parsed > new Date()) {
                    return res.status(400).json({ success: false, message: "Enter a valid date of birth in the past" });
                }
                dob = parsed;
            }
        }

        const details = decryptHrDetails(employee.hrDetailsEncrypted);
        for (const field of SENSITIVE_FIELDS) {
            if (body[field] !== undefined) {
                if (typeof body[field] !== "string" || body[field].length > 100) {
                    return res.status(400).json({ success: false, message: "Invalid HR details value" });
                }
                details[field] = body[field].trim();
            }
        }

        const pan = details.panNumber || "";
        const ifsc = details.ifscCode || "";
        const account = details.bankAccountNumber || "";
        const uan = details.uanNumber || "";
        if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())) {
            return res.status(400).json({ success: false, message: "PAN format is invalid" });
        }
        if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
            return res.status(400).json({ success: false, message: "IFSC format is invalid" });
        }
        if (account && !/^\d{6,20}$/.test(account)) {
            return res.status(400).json({ success: false, message: "Bank account number must contain 6 to 20 digits" });
        }
        if (uan && !/^\d{12}$/.test(uan)) {
            return res.status(400).json({ success: false, message: "UAN must contain exactly 12 digits" });
        }
        details.panNumber = pan.toUpperCase();
        details.ifscCode = ifsc.toUpperCase();

        employee.dateOfBirth = dob;
        employee.hrDetailsEncrypted = encryptHrDetails(details);
        await employee.save();

        return res.status(200).json({
            success: true,
            message: "HR and payroll details saved securely",
            data: publicDetails(employee, details)
        });
    } catch (error) {
        if (error.code === "HR_ENCRYPTION_NOT_CONFIGURED") {
            return res.status(503).json({ success: false, message: "HR details encryption is not configured on the server" });
        }
        console.error("Update employee HR details failed:", error.message);
        return res.status(500).json({ success: false, message: "Unable to save HR details" });
    }
};
