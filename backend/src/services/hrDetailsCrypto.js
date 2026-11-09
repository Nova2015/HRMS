import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const getKey = () => {
    const value = process.env.HR_DATA_ENCRYPTION_KEY || "";
    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
        const error = new Error("HR_DATA_ENCRYPTION_KEY must be configured as 64 hexadecimal characters");
        error.code = "HR_ENCRYPTION_NOT_CONFIGURED";
        throw error;
    }
    return Buffer.from(value, "hex");
};

export const encryptHrDetails = (details) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(details), "utf8"),
        cipher.final()
    ]);
    return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
};

export const decryptHrDetails = (value) => {
    if (!value) return {};
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    if (!ivHex || !tagHex || !encryptedHex) throw new Error("Stored HR details are invalid");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, "hex")),
        decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8"));
};
