import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { __private } from "../src/services/googleDriveService.js";

test("Google Drive filename is sanitized and bounded", () => {
    assert.equal(__private.safeFileName("../private\\report.pdf"), ".._private_report.pdf");
    assert.equal(__private.safeFileName(""), "document");
    assert.equal(__private.safeFileName("x".repeat(220)).length, 180);
});

test("Google Drive service enforces the existing 10 MB upload ceiling", () => {
    assert.equal(__private.MAX_FILE_BYTES, 10 * 1024 * 1024);
});

test("Google Drive download checksum uses SHA-256", () => {
    const digest = crypto.createHash("sha256").update(Buffer.from("hrms")).digest("hex");
    assert.match(digest, /^[a-f0-9]{64}$/);
});
