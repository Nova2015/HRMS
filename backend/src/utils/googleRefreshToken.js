export const requireGoogleRefreshToken = (encryptedToken) => {
    if (!encryptedToken) {
        const error = new Error("Google authorization is unavailable; reconnect the account");
        error.status = 401;
        throw error;
    }
    return encryptedToken;
};
