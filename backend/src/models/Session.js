import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    tokenVersion: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now, required: true },
    lastSeenAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    ipAddress: { type: String, default: "", maxlength: 80 },
    userAgent: { type: String, default: "", maxlength: 300 }
}, { timestamps: false });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model("Session", sessionSchema);
