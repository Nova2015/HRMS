import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import ExpenseClaim from "../models/ExpenseClaim.js";
import ExpenseLimit from "../models/ExpenseLimit.js";
import Employee from "../models/Employee.js";
import { EXPENSE_RECEIPT_STORAGE_DIR } from "../middleware/expenseReceiptUpload.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const CATEGORIES = new Set(["travel", "meals", "equipment"]);
const isPrivileged = (role) => ["admin", "hr"].includes(role);
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const removeUploadedFile = async (filePath) => {
    if (!filePath) return;
    try { await fs.unlink(filePath); }
    catch (error) { if (error.code !== "ENOENT") console.error("Unable to remove rejected receipt:", error.message); }
};

const safeOriginalName = (name) =>
    path.win32.basename(path.basename(String(name || "receipt")))
        .replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "receipt";

const hasValidFileSignature = async (filePath, mimeType) => {
    const handle = await fs.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(8);
        const { bytesRead } = await handle.read(buffer, 0, 8, 0);
        const header = buffer.subarray(0, bytesRead);
        if (mimeType === "application/pdf") return header.subarray(0, 5).toString() === "%PDF-";
        if (mimeType === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        if (mimeType === "image/png") return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        return false;
    } finally { await handle.close(); }
};

const populateClaim = (query) =>
    query.populate("employee", "employeeCode firstName lastName email")
        .populate("reviewedBy", "email")
        .populate("reimbursedBy", "email");

const validateReceipt = async (file, res) => {
    if (!file) {
        res.status(400).json({ success: false, message: "Upload a PDF, JPG or PNG receipt" });
        return false;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || file.size < 1 || file.size > MAX_FILE_SIZE ||
        !(await hasValidFileSignature(file.path, file.mimetype))) {
        await removeUploadedFile(file.path);
        res.status(400).json({ success: false, message: "Receipt content is invalid or its format is not supported" });
        return false;
    }
    return true;
};

export const getExpenseWorkspace = async (req, res) => {
    try {
        const filter = isPrivileged(req.user.role) ? {} : { employee: req.user.employeeId };
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const usageFilter = { employee: new mongoose.Types.ObjectId(req.user.employeeId) };
        const [claims, limits, totals, monthlyUsage] = await Promise.all([
            populateClaim(ExpenseClaim.find(filter).sort({ createdAt: -1 }).limit(200)),
            ExpenseLimit.find({ isActive: true }).sort({ category: 1 }),
            ExpenseClaim.aggregate([
                { $match: filter },
                { $group: {
                    _id: null,
                    totalReimbursed: { $sum: { $cond: [{ $eq: ["$status", "reimbursed"] }, "$amount", 0] } },
                    pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
                    totalClaims: { $sum: 1 }
                } }
            ]),
            ExpenseClaim.aggregate([
                { $match: { ...usageFilter, expenseDate: { $gte: monthStart }, status: { $ne: "rejected" } } },
                { $group: { _id: "$category", used: { $sum: "$amount" } } }
            ])
        ]);
        const usageMap = new Map(monthlyUsage.map((item) => [item._id, money(item.used)]));
        const dataLimits = limits.map((item) => ({
            _id: item._id,
            category: item.category,
            monthlyLimit: item.monthlyLimit,
            usedThisMonth: usageMap.get(item.category) || 0
        }));
        return res.json({
            success: true,
            data: {
                claims,
                limits: dataLimits,
                summary: {
                    totalReimbursed: money(totals[0]?.totalReimbursed || 0),
                    pendingCount: totals[0]?.pendingCount || 0,
                    approvedCount: totals[0]?.approvedCount || 0,
                    totalClaims: totals[0]?.totalClaims || 0
                },
                corporateCard: { connected: false, provider: null }
            }
        });
    } catch (error) {
        console.error("Get expense workspace:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load expense workspace" });
    }
};

export const createExpenseClaim = async (req, res) => {
    const file = req.file;
    try {
        if (!(await validateReceipt(file, res))) return;
        const { category, amount, expenseDate, merchant = "", description } = req.body || {};
        const value = Number(amount);
        const date = new Date(expenseDate);
        if (!CATEGORIES.has(category) || !Number.isFinite(value) || value <= 0 || value > 100000000 ||
            !expenseDate || Number.isNaN(date.getTime()) || date > new Date() ||
            !String(description || "").trim() || String(description).trim().length > 1000 ||
            String(merchant).trim().length > 120) {
            await removeUploadedFile(file.path);
            return res.status(400).json({ success: false, message: "Provide a valid category, amount, expense date and description. Future dates are not allowed." });
        }
        const employee = await Employee.findOne({ _id: req.user.employeeId, employmentStatus: "active" }).select("_id");
        if (!employee) {
            await removeUploadedFile(file.path);
            return res.status(403).json({ success: false, message: "An active employee account is required" });
        }
        const limit = await ExpenseLimit.findOne({ category, isActive: true });
        const claim = await ExpenseClaim.create({
            employee: employee._id,
            category,
            amount: money(value),
            expenseDate: date,
            merchant: String(merchant).trim(),
            description: String(description).trim(),
            receiptOriginalName: safeOriginalName(file.originalname),
            receiptStoredName: path.basename(file.filename),
            receiptMimeType: file.mimetype,
            receiptSize: file.size,
            policyLimitAtSubmission: limit?.monthlyLimit ?? null,
            overLimitAtSubmission: Boolean(limit && value > limit.monthlyLimit)
        });
        const data = await populateClaim(ExpenseClaim.findById(claim._id));
        return res.status(201).json({ success: true, message: "Expense claim submitted for approval", data });
    } catch (error) {
        await removeUploadedFile(file?.path);
        console.error("Create expense claim:", error.message);
        return res.status(500).json({ success: false, message: "Unable to submit expense claim" });
    }
};

export const reviewExpenseClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, reviewComment = "" } = req.body || {};
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid claim ID" });
        if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ success: false, message: "Decision must be approved or rejected" });
        const comment = String(reviewComment).trim();
        if (comment.length > 1000) return res.status(400).json({ success: false, message: "Review comment cannot exceed 1000 characters" });
        const claim = await ExpenseClaim.findOneAndUpdate(
            { _id: id, status: "pending" },
            { $set: { status: decision, reviewedBy: req.user.userId, reviewedAt: new Date(), reviewComment: comment } },
            { new: true, runValidators: true }
        );
        if (!claim) {
            const exists = await ExpenseClaim.exists({ _id: id });
            return res.status(exists ? 409 : 404).json({ success: false, message: exists ? "Only pending claims can be reviewed" : "Expense claim not found" });
        }
        const data = await populateClaim(ExpenseClaim.findById(claim._id));
        return res.json({ success: true, message: `Expense claim ${decision} successfully`, data });
    } catch (error) {
        console.error("Review expense claim:", error.message);
        return res.status(500).json({ success: false, message: "Unable to review expense claim" });
    }
};

export const reimburseExpenseClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const reference = String(req.body?.reimbursementReference || "").trim();
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid claim ID" });
        if (reference.length > 120) return res.status(400).json({ success: false, message: "Reference cannot exceed 120 characters" });
        const claim = await ExpenseClaim.findOneAndUpdate(
            { _id: id, status: "approved" },
            { $set: { status: "reimbursed", reimbursedBy: req.user.userId, reimbursedAt: new Date(), reimbursementReference: reference } },
            { new: true, runValidators: true }
        );
        if (!claim) {
            const exists = await ExpenseClaim.exists({ _id: id });
            return res.status(exists ? 409 : 404).json({ success: false, message: exists ? "Only approved claims can be marked reimbursed" : "Expense claim not found" });
        }
        const data = await populateClaim(ExpenseClaim.findById(claim._id));
        return res.json({ success: true, message: "Claim marked as reimbursed", data });
    } catch (error) {
        console.error("Reimburse expense claim:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update reimbursement status" });
    }
};

export const saveExpenseLimit = async (req, res) => {
    try {
        const { category } = req.params;
        const monthlyLimit = Number(req.body?.monthlyLimit);
        if (!CATEGORIES.has(category) || !Number.isFinite(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > 100000000) {
            return res.status(400).json({ success: false, message: "Provide a valid category and non-negative monthly limit" });
        }
        const data = await ExpenseLimit.findOneAndUpdate(
            { category },
            { $set: { monthlyLimit: money(monthlyLimit), isActive: true, updatedBy: req.user.userId } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        return res.json({ success: true, message: "Monthly category limit saved", data });
    } catch (error) {
        console.error("Save expense limit:", error.message);
        return res.status(500).json({ success: false, message: "Unable to save category limit" });
    }
};

export const downloadExpenseReceipt = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid claim ID" });
        const claim = await ExpenseClaim.findById(id).select("employee receiptOriginalName receiptStoredName receiptMimeType");
        if (!claim) return res.status(404).json({ success: false, message: "Expense claim not found" });
        if (!isPrivileged(req.user.role) && claim.employee.toString() !== req.user.employeeId) {
            return res.status(403).json({ success: false, message: "You do not have permission to access this receipt" });
        }
        const filePath = path.join(EXPENSE_RECEIPT_STORAGE_DIR, path.basename(claim.receiptStoredName));
        try { await fs.access(filePath); }
        catch { return res.status(404).json({ success: false, message: "Stored receipt file was not found" }); }
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", claim.receiptMimeType);
        return res.download(filePath, safeOriginalName(claim.receiptOriginalName));
    } catch (error) {
        console.error("Download expense receipt:", error.message);
        return res.status(500).json({ success: false, message: "Unable to download receipt" });
    }
};
