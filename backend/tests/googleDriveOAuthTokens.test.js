import test from "node:test";
import assert from "node:assert/strict";
import {
    resolveGoogleDriveRefreshToken,
    hasGoogleDriveFileScope
} from "../src/utils/googleDriveOAuthTokens.js";

test("Google Drive refresh token is encrypted when Google returns a new token", () => {
    const encryptToken = (value) => `encrypted:${value}`;
    assert.equal(resolveGoogleDriveRefreshToken({
        newRefreshToken: "new-refresh",
        existingRefreshTokenEncrypted: "old-encrypted",
        existingGoogleEmail: "company@example.com",
        googleEmail: "company@example.com",
        encryptToken
    }), "encrypted:new-refresh");
});

test("Google Drive refresh token is reused only for the same Google account", () => {
    const args = {
        existingRefreshTokenEncrypted: "existing-encrypted",
        existingGoogleEmail: "company@example.com",
        googleEmail: "company@example.com"
    };
    assert.equal(resolveGoogleDriveRefreshToken(args), "existing-encrypted");
    assert.equal(resolveGoogleDriveRefreshToken({ ...args, googleEmail: "other@example.com" }), null);
    assert.equal(resolveGoogleDriveRefreshToken({ ...args, existingGoogleEmail: "COMPANY@example.com" }), "existing-encrypted");
});

test("Google Drive refresh token is not reused when no matching account is known", () => {
    assert.equal(resolveGoogleDriveRefreshToken({
        existingRefreshTokenEncrypted: "existing-encrypted",
        googleEmail: "company@example.com"
    }), null);
});

test("Google Drive OAuth requires the exact drive.file scope", () => {
    assert.equal(hasGoogleDriveFileScope("openid email profile https://www.googleapis.com/auth/drive.file"), true);
    assert.equal(hasGoogleDriveFileScope("openid email profile"), false);
    assert.equal(hasGoogleDriveFileScope("https://www.googleapis.com/auth/drive"), false);
    assert.equal(hasGoogleDriveFileScope(undefined), false);
});
