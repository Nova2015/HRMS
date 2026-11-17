import mongoose from "mongoose";

const leaveAllocationSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    casual: { type: Number, required: true, min: 0, max: 366, default: 0 },
    sick: { type: Number, required: true, min: 0, max: 366, default: 0 },
    earned: { type: Number, required: true, min: 0, max: 366, default: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

leaveAllocationSchema.index({ employee: 1, year: 1 }, { unique: true });
export default mongoose.model("LeaveAllocation", leaveAllocationSchema);
