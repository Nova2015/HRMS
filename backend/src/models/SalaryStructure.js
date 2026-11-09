import mongoose from "mongoose";

const componentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, unique: true },
    monthlyBasic: { type: Number, required: true, min: 0 },
    earnings: { type: [componentSchema], default: [] },
    deductions: { type: [componentSchema], default: [] },
    currency: { type: String, default: "INR", enum: ["INR"] },
    effectiveFrom: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default mongoose.model("SalaryStructure", salaryStructureSchema);
