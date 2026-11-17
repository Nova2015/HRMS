import mongoose from "mongoose";

const googleOAuthStateSchema = new mongoose.Schema(
    {
        nonce: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        sessionJti: {
            type: String,
            required: true
        },
        tokenVersion: {
            type: Number,
            required: true,
            default: 0
        },
        expiresAt: {
            type: Date,
            required: true,
            expires: 0
        }
    },
    { timestamps: true }
);

export default mongoose.model("GoogleOAuthState", googleOAuthStateSchema);
