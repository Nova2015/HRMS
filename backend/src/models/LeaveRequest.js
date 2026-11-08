import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },
        leaveType: {
            type: String,
            enum: ["casual", "sick", "earned", "unpaid"],
            required: true
        },
        startDate: {
            type: String,
            required: true,
            match: /^\\d{4}-\\d{2}-\\d{2}$/
        },
        endDate: {
            type: String,
            required: true,
            match: /^\\d{4}-\\d{2}-\\d{2}$/
        },
        totalDays: {
            type: Number,
            required: true,
            min: 1
        },
        reason: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "cancelled"],
            default: "pending",
            index: true
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        },
        reviewComment: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        }
    },
    { timestamps: true }
);

leaveRequestSchema.index({ employee: 1, startDate: 1, endDate: 1 });

const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequest;
