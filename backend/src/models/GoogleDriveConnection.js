import mongoose from "mongoose";

// One dedicated company Drive connection, independent from per-user Gmail connections.
const googleDriveConnectionSchema = new mongoose.Schema(
    {
        connectionKey: {
            type: String,
            required: true,
            unique: true,
            enum: ["company_document_storage"],
            default: "company_document_storage"
        },
        googleEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        accessTokenEncrypted: {
            type: String,
            required: true,
            select: false
        },
        refreshTokenEncrypted: {
            type: String,
            required: true,
            select: false
        },
        tokenExpiresAt: {
            type: Date,
            default: null
        },
        scopes: {
            type: [String],
            default: []
        },
        connectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        connectedAt: {
            type: Date,
            default: Date.now
        },
        lastUsedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

export default mongoose.model("GoogleDriveConnection", googleDriveConnectionSchema);
