import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import PerformanceReview from "../models/PerformanceReview.js";

const adminRoles = ["admin", "hr"];
const employeeFields = "employeeCode firstName lastName department designation reportingManager";

const populateReview = (query) => query
    .populate({ path: "employee", select: employeeFields, populate: [
        { path: "department", select: "name" },
        { path: "designation", select: "name" },
        { path: "reportingManager", select: "firstName lastName" }
    ] })
    .populate("managerReview.reviewedBy", "email role");

const canReview = async (req, review) => {
    if (adminRoles.includes(req.user.role)) return true;
    if (req.user.role !== "manager") return false;
    const employee = await Employee.findById(review.employee).select("reportingManager");
    return Boolean(employee?.reportingManager?.toString() === req.user.employeeId);
};

export const getPerformanceReviews = async (req, res) => {
    try {
        const filter = {};
        if (req.query.period) {
            if (!/^\d{4}-(H1|H2|ANNUAL)$/.test(String(req.query.period))) {
                return res.status(400).json({ success: false, message: "Invalid review period" });
            }
            filter.period = String(req.query.period);
        }
        if (adminRoles.includes(req.user.role)) {
            // HR and Admin can view all review records.
        } else if (req.user.role === "manager") {
            const team = await Employee.find({ reportingManager: req.user.employeeId, employmentStatus: "active" }).distinct("_id");
            filter.employee = { $in: [...team, new mongoose.Types.ObjectId(req.user.employeeId)] };
        } else {
            filter.employee = req.user.employeeId;
        }
        const reviews = await populateReview(PerformanceReview.find(filter).sort({ period: -1, updatedAt: -1 }).limit(500));
        return res.json({ success: true, data: reviews });
    } catch (error) {
        console.error("Performance reviews load:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load performance reviews" });
    }
};

export const createPerformanceCycle = async (req, res) => {
    try {
        const { period } = req.body || {};
        if (!/^\d{4}-(H1|H2|ANNUAL)$/.test(String(period || ""))) {
            return res.status(400).json({ success: false, message: "Choose a valid period such as 2026-H2 or 2026-ANNUAL" });
        }
        const employees = await Employee.find({ employmentStatus: "active", isTestRecord: { $ne: true } }).select("_id");
        if (!employees.length) return res.status(400).json({ success: false, message: "No active employees found" });
        const operations = employees.map(({ _id }) => ({
            updateOne: {
                filter: { employee: _id, period },
                update: { $setOnInsert: { employee: _id, period, createdBy: req.user.userId } },
                upsert: true
            }
        }));
        const result = await PerformanceReview.bulkWrite(operations, { ordered: false });
        return res.status(201).json({
            success: true,
            message: `Review cycle ${period} is ready for ${employees.length} active employees. Existing reviews were preserved.`,
            data: { period, employees: employees.length, created: result.upsertedCount || 0 }
        });
    } catch (error) {
        console.error("Performance cycle creation:", error.message);
        return res.status(500).json({ success: false, message: "Unable to create performance review cycle" });
    }
};

export const submitSelfReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { goals = "", achievements = "", strengths = "", improvements = "" } = req.body || {};
        if (!mongoose.isValidObjectId(id) ||
            [goals, achievements, strengths, improvements].some((value) => typeof value !== "string" || value.length > 3000)) {
            return res.status(400).json({ success: false, message: "Provide valid review details" });
        }
        const review = await PerformanceReview.findOne({ _id: id, employee: req.user.employeeId });
        if (!review) return res.status(404).json({ success: false, message: "Review cycle not found for your account" });
        if (["manager_reviewed", "finalized"].includes(review.status)) {
            return res.status(409).json({ success: false, message: "Self-review is locked after manager review" });
        }
        review.selfReview = { goals: goals.trim(), achievements: achievements.trim(), strengths: strengths.trim(), improvements: improvements.trim(), submittedAt: new Date() };
        review.status = "self_submitted";
        await review.save();
        return res.json({ success: true, message: "Self-review submitted successfully", data: await populateReview(PerformanceReview.findById(review._id)) });
    } catch (error) {
        console.error("Self-review submit:", error.message);
        return res.status(500).json({ success: false, message: "Unable to submit self-review" });
    }
};

export const submitManagerReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comments = "", finalize = false } = req.body || {};
        const numericRating = Number(rating);
        if (!mongoose.isValidObjectId(id) || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5 ||
            typeof comments !== "string" || !comments.trim() || comments.length > 3000 || typeof finalize !== "boolean") {
            return res.status(400).json({ success: false, message: "Provide a rating from 1 to 5 and review comments" });
        }
        const review = await PerformanceReview.findById(id);
        if (!review) return res.status(404).json({ success: false, message: "Performance review not found" });
        if (!(await canReview(req, review))) return res.status(403).json({ success: false, message: "You can review only your assigned team members" });
        if (review.status === "finalized") return res.status(409).json({ success: false, message: "This review has already been finalized" });
        if (review.status === "pending") return res.status(409).json({ success: false, message: "Employee must submit the self-review before manager review" });
        review.managerReview = { rating: numericRating, comments: comments.trim(), reviewedBy: req.user.userId, reviewedAt: new Date() };
        review.status = finalize ? "finalized" : "manager_reviewed";
        review.finalizedAt = finalize ? new Date() : null;
        await review.save();
        return res.json({ success: true, message: finalize ? "Performance review finalized" : "Manager review saved", data: await populateReview(PerformanceReview.findById(review._id)) });
    } catch (error) {
        console.error("Manager review submit:", error.message);
        return res.status(500).json({ success: false, message: "Unable to save manager review" });
    }
};
