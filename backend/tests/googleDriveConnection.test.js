import test from "node:test";
import assert from "node:assert/strict";
import GoogleDriveConnection from "../src/models/GoogleDriveConnection.js";
import { decryptGoogleToken, encryptGoogleToken } from "../src/utils/googleTokenEncryption.js";

const USER_ID = "64b000000000000000000071";

test("company Drive connection requires a dedicated company storage identity and encrypted credentials", () => {
    const connection = new GoogleDriveConnection({
        googleEmail: "company@example.com",
        accessTokenEncrypted: "encrypted-access",
        refreshTokenEncrypted: "encrypted-refresh",
        connectedBy: USER_ID,
        scopes: ["https://www.googleapis.com/auth/drive.file"]
    });

    assert.equal(connection.connectionKey, "company_document_storage");
    assert.equal(connection.googleEmail, "company@example.com");
    assert.equal(connection.validateSync(), undefined);
});

test("company Drive connection rejects a different connection key", () => {
    const connection = new GoogleDriveConnection({
        connectionKey: "personal_gmail",
        googleEmail: "company@example.com",
        accessTokenEncrypted: "encrypted-access",
        refreshTokenEncrypted: "encrypted-refresh",
        connectedBy: USER_ID
    });

    assert.ok(connection.validateSync()?.errors.connectionKey);
});

test("Google token encryption round-trips with AES-256-GCM", () => {
    const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
        const encrypted = encryptGoogleToken("refresh-token-secret");
        assert.notEqual(encrypted, "refresh-token-secret");
        assert.equal(decryptGoogleToken(encrypted), "refresh-token-secret");
        assert.notEqual(encryptGoogleToken("refresh-token-secret"), encrypted);
    } finally {
        if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
        else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    }
});

test("Google token decryption rejects tampered ciphertext", () => {
    const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    try {
        const encrypted = encryptGoogleToken("refresh-token-secret");
        const [iv, tag, ciphertext] = encrypted.split(".");
        const changed = (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);
        assert.throws(() => decryptGoogleToken([iv, tag, changed].join(".")));
    } finally {
        if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
        else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    }
});

test("Google token encryption rejects missing keys and malformed token payloads", () => {
    const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    try {
        assert.throws(() => encryptGoogleToken("token"), /GOOGLE_TOKEN_ENCRYPTION_KEY is required/);
        assert.throws(() => decryptGoogleToken("invalid"));
    } finally {
        if (previousKey !== undefined) process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    }
});
