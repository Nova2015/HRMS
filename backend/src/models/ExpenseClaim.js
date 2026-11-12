import mongoose from "mongoose";

const expenseClaimSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        category: { type: String, enum: ["travel", "meals", "equipment"], required: true, index: true },
        amount: { type: Number, required: true, min: 0.01, max: 100000000 },
        expenseDate: { type: Date, required: true, index: true },
        merchant: { type: String, trim: true, maxlength: 120, default: "" },
        description: { type: String, trim: true, maxlength: 1000, required: true },
        receiptOriginalName: { type: String, required: true, maxlength: 255 },
        receiptStoredName: { type: String, required: true, unique: true },
        receiptMimeType: { type: String, enum: ["application/pdf", "image/jpeg", "image/png"], required: true },
        receiptSize: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
        status: { type: String, enum: ["pending", "approved", "rejected", "reimbursed"], default: "pending", index: true },
        policyLimitAtSubmission: { type: Number, default: null, min: 0 },
        overLimitAtSubmission: { type: Boolean, default: false },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        reviewComment: { type: String, trim: true, maxlength: 1000, default: "" },
        reimbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reimbursedAt: { type: Date, default: null },
        reimbursementReference: { type: String, trim: true, maxlength: 120, default: "" }
    },
    { timestamps: true }
);

expenseClaimSchema.index({ employee: 1, expenseDate: -1 });
expenseClaimSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("ExpenseClaim", expenseClaimSchema);
