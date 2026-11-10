import mongoose from "mongoose";

const companyEventSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    eventType: {
        type: String,
        enum: ["meeting", "company_event", "training", "other"],
        default: "company_event",
        index: true
    },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    location: { type: String, trim: true, maxlength: 200, default: "" },
    status: { type: String, enum: ["scheduled", "cancelled"], default: "scheduled", index: true },
    googleEventId: { type: String, default: undefined, index: { sparse: true } },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

companyEventSchema.index({ startAt: 1, endAt: 1, status: 1 });

export default mongoose.models.CompanyEvent || mongoose.model("CompanyEvent", companyEventSchema);
