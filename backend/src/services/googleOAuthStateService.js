import GoogleOAuthState from "../models/GoogleOAuthState.js";

export const consumeGoogleOAuthState = async ({
    nonce,
    userId,
    sessionJti,
    tokenVersion = 0,
    now = new Date()
}) => {
    if (!nonce || !userId || !sessionJti) return false;

    const consumed = await GoogleOAuthState.findOneAndDelete({
        nonce,
        userId,
        sessionJti,
        tokenVersion,
        expiresAt: { $gt: now }
    }).select("_id");

    return Boolean(consumed);
};
