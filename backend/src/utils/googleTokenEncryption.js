import crypto from "node:crypto";

const getEncryptionKey = () => {
    const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!encoded) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) {
        throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }
    return key;
};

export const encryptGoogleToken = (value) => {
    if (typeof value !== "string" || !value) throw new Error("Google token must be a non-empty string");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
};

export const decryptGoogleToken = (value) => {
    if (typeof value !== "string") throw new Error("Stored Google token is missing");
    const [ivPart, tagPart, ciphertextPart, ...extra] = value.split(".");
    if (!ivPart || !tagPart || !ciphertextPart || extra.length) {
        throw new Error("Stored Google token is invalid");
    }
    const iv = Buffer.from(ivPart, "base64");
    const tag = Buffer.from(tagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
        throw new Error("Stored Google token is invalid");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
