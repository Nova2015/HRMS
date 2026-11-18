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
        },
        documentType: {
            type: String,
            enum: ["other", "resignation_letter", "payslip", "appointment_letter", "offer_letter", "confirmation_letter", "salary_revision_letter", "leave_letter", "leave_rejection_notice", "relieving_letter"],
            default: "other",
            index: true
        },
        direction: {
            type: String,
            enum: ["employee_to_hr", "hr_to_employee"],
            default: "employee_to_hr",
            index: true
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "issued"],
            default: "pending",
            index: true
        },
        storageProvider: {
            type: String,
            enum: ["local", "google_drive"],
            default: "local"
        },
        storageMigrationStatus: {
            type: String,
            enum: ["not_started", "in_progress", "verified", "failed"],
            default: "not_started"
        },
        googleDriveFileId: {
            type: String,
            trim: true,
            default: null
        },
        googleDriveChecksumSha256: {
            type: String,
            lowercase: true,
            match: /^[a-f0-9]{64}$/,
            default: null
        },
        googleDriveVerifiedAt: {
            type: Date,
            default: null
        },
        storageMigrationError: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },
        sourceKey: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        },
        reviewComment: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        }
    },
    { timestamps: true }
);

employeeDocumentSchema.index({ employee: 1, createdAt: -1 });

const EmployeeDocument = mongoose.model("EmployeeDocument", employeeDocumentSchema);

export default EmployeeDocument;
