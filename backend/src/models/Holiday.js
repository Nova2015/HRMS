import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        dateKey: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/
        },
        type: {
            type: String,
            enum: ["public", "optional", "company"],
            default: "public"
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

holidaySchema.index({ dateKey: 1, name: 1 }, { unique: true });

const Holiday = mongoose.model("Holiday", holidaySchema);

export default Holiday;
