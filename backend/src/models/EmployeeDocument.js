import mongoose from "mongoose";

const employeeDocumentSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },
        originalName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        storedName: {
            type: String,
            required: true,
            unique: true
        },
        mimeType: {
            type: String,
            required: true,
            enum: ["application/pdf", "image/jpeg", "image/png"]
        },
        size: {
            type: Number,
            required: true,
            min: 1,
            max: 10 * 1024 * 1024
        }
    },
    { timestamps: true }
);

employeeDocumentSchema.index({ employee: 1, createdAt: -1 });

const EmployeeDocument = mongoose.model("EmployeeDocument", employeeDocumentSchema);

export default EmployeeDocument;
