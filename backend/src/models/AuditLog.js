import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    role: { type: String, required: true, enum: ["admin", "hr", "manager", "employee"] },
    action: { type: String, required: true, maxlength: 120, index: true },
    module: { type: String, required: true, maxlength: 60, index: true },
    method: { type: String, required: true, maxlength: 10 },
    route: { type: String, required: true, maxlength: 240 },
    resourceId: { type: String, default: "", maxlength: 80 },
    statusCode: { type: Number, required: true },
    ipAddress: { type: String, default: "", maxlength: 80 },
    userAgent: { type: String, default: "", maxlength: 300 }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
