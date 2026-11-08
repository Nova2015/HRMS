import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20, unique: true },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        gracePeriodMinutes: { type: Number, min: 0, max: 180, default: 15 },
        isActive: { type: Boolean, default: true, index: true },
        description: { type: String, trim: true, maxlength: 500, default: "" }
    },
    { timestamps: true }
);

const Shift = mongoose.model("Shift", shiftSchema);
export default Shift;
