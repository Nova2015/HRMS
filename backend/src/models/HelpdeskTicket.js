import mongoose from "mongoose";

const helpdeskTicketSchema = new mongoose.Schema(
    {
        ticketNumber: {
            type: String,
            unique: true,
            index: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },
        category: {
            type: String,
            enum: ["hardware", "software", "network", "access", "other"],
            required: true
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "urgent"],
            default: "medium",
            required: true
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 140
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 3000
        },
        status: {
            type: String,
            enum: ["open", "in_progress", "resolved", "closed"],
            default: "open",
            index: true
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        resolutionNote: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        },
        resolvedAt: {
            type: Date,
            default: null
        },
        closedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

helpdeskTicketSchema.pre("validate", async function () {
    if (!this.ticketNumber && this.isNew) {
        const year = new Date().getFullYear();
        const latest = await mongoose.model("HelpdeskTicket")
            .findOne({ ticketNumber: new RegExp(`^HD-${year}-`) })
            .sort({ createdAt: -1 })
            .select("ticketNumber")
            .lean();
        const sequence = latest?.ticketNumber
            ? Number(latest.ticketNumber.split("-").at(-1)) + 1
            : 1;
        this.ticketNumber = `HD-${year}-${String(sequence).padStart(5, "0")}`;
    }
});

const HelpdeskTicket = mongoose.model("HelpdeskTicket", helpdeskTicketSchema);
export default HelpdeskTicket;
