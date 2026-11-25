import GoogleDriveOAuthState from "../models/GoogleDriveOAuthState.js";

export const consumeGoogleDriveOAuthState = async ({
    nonce,
    userId,
    sessionJti,
    tokenVersion = 0,
    now = new Date()
}) => {
    if (!nonce || !userId || !sessionJti) return false;

    const consumed = await GoogleDriveOAuthState.findOneAndDelete({
        nonce,
        userId,
        sessionJti,
        tokenVersion,
        expiresAt: { $gt: now }
    }).select("_id");

    return Boolean(consumed);
};
