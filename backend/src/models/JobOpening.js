import mongoose from "mongoose";

const jobOpeningSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: "Designation", required: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    employmentType: { type: String, enum: ["full_time", "part_time", "contract", "internship"], default: "full_time" },
    location: { type: String, trim: true, default: "" },
    openings: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: ["open", "on_hold", "closed"], default: "open" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

jobOpeningSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("JobOpening", jobOpeningSchema);
