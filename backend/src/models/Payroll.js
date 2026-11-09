import mongoose from "mongoose";

const lineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const payrollSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: "SalaryStructure", required: true },
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    workingDays: { type: Number, required: true, min: 1 },
    paidDays: { type: Number, required: true, min: 0 },
    basic: { type: Number, required: true, min: 0 },
    earnings: { type: [lineSchema], default: [] },
    deductions: { type: [lineSchema], default: [] },
    grossEarnings: { type: Number, required: true, min: 0 },
    totalDeductions: { type: Number, required: true, min: 0 },
    netPay: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["processed", "paid"], default: "processed" },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    paidAt: { type: Date, default: null }
}, { timestamps: true });

payrollSchema.index({ employee: 1, period: 1 }, { unique: true });
export default mongoose.model("Payroll", payrollSchema);
