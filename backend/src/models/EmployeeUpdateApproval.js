import mongoose from "mongoose";

const employeeUpdateApprovalSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },
        employeeCode: { type: String, required: true, trim: true },
        source: {
            type: String,
            enum: ["gmail", "document", "manual"],
            required: true
        },
        sourceReference: { type: String, default: "", trim: true, maxlength: 500 },
        sourceSubject: { type: String, default: "", trim: true, maxlength: 300 },
        proposedChanges: { type: mongoose.Schema.Types.Mixed, required: true },
        oldValues: { type: mongoose.Schema.Types.Mixed, default: null },
        appliedValues: { type: mongoose.Schema.Types.Mixed, default: null },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        decidedAt: { type: Date, default: null },
        decisionNote: { type: String, default: "", trim: true, maxlength: 1000 }
    },
    { timestamps: true }
);

employeeUpdateApprovalSchema.index({ status: 1, createdAt: -1 });
employeeUpdateApprovalSchema.index({ employee: 1, createdAt: -1 });

export default mongoose.model("EmployeeUpdateApproval", employeeUpdateApprovalSchema);
