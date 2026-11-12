import mongoose from "mongoose";

const performanceReviewSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    period: { type: String, required: true, trim: true, match: /^\d{4}-(H1|H2|ANNUAL)$/ },
    status: {
        type: String,
        enum: ["pending", "self_submitted", "manager_reviewed", "finalized"],
        default: "pending",
        index: true
    },
    selfReview: {
        goals: { type: String, trim: true, maxlength: 3000, default: "" },
        achievements: { type: String, trim: true, maxlength: 3000, default: "" },
        strengths: { type: String, trim: true, maxlength: 2000, default: "" },
        improvements: { type: String, trim: true, maxlength: 2000, default: "" },
        submittedAt: { type: Date, default: null }
    },
    managerReview: {
        rating: { type: Number, min: 1, max: 5, default: null },
        comments: { type: String, trim: true, maxlength: 3000, default: "" },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null }
    },
    finalizedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

performanceReviewSchema.index({ employee: 1, period: 1 }, { unique: true });

export default mongoose.model("PerformanceReview", performanceReviewSchema);
