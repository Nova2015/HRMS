import mongoose from "mongoose";

const googleGmailIntegrationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
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
            default: null,
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

export default mongoose.model("GoogleGmailIntegration", googleGmailIntegrationSchema);
