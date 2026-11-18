export const resolveGoogleDriveRefreshToken = ({
    newRefreshToken,
    existingRefreshTokenEncrypted,
    existingGoogleEmail,
    googleEmail,
    encryptToken
}) => {
    if (newRefreshToken) {
        if (typeof encryptToken !== "function") throw new Error("A token encryption function is required");
        return encryptToken(newRefreshToken);
    }

    if (
        existingRefreshTokenEncrypted &&
        typeof existingGoogleEmail === "string" &&
        typeof googleEmail === "string" &&
        existingGoogleEmail.toLowerCase() === googleEmail.toLowerCase()
    ) {
        return existingRefreshTokenEncrypted;
    }

    return null;
};

export const hasGoogleDriveFileScope = (scopeValue) =>
    typeof scopeValue === "string" &&
    scopeValue.split(/\\s+/).includes("https://www.googleapis.com/auth/drive.file");
