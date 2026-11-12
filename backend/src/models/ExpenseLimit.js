import mongoose from "mongoose";

const expenseLimitSchema = new mongoose.Schema(
    {
        category: { type: String, enum: ["travel", "meals", "equipment"], required: true, unique: true },
        monthlyLimit: { type: Number, required: true, min: 0, max: 100000000 },
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    { timestamps: true }
);

export default mongoose.model("ExpenseLimit", expenseLimitSchema);
