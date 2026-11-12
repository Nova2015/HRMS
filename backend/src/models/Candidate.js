import mongoose from "mongoose";

const candidateSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true, maxlength: 25 },
    jobOpening: { type: mongoose.Schema.Types.ObjectId, ref: "JobOpening", required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: "Designation", required: true },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    currentCompany: { type: String, trim: true, default: "", maxlength: 120 },
    resumeUrl: { type: String, trim: true, default: "", maxlength: 500 },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    status: { type: String, enum: ["applied", "screening", "interview", "selected", "rejected", "hired"], default: "applied" },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hiredAt: { type: Date, default: null }
}, { timestamps: true });

candidateSchema.index({ email: 1, jobOpening: 1 }, { unique: true });
candidateSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Candidate", candidateSchema);
