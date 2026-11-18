import test from "node:test";
import assert from "node:assert/strict";
import EmployeeDocument from "../src/models/EmployeeDocument.js";
import ExpenseClaim from "../src/models/ExpenseClaim.js";

const EMPLOYEE_ID = "64b000000000000000000071";

const validEmployeeDocument = () => new EmployeeDocument({
    employee: EMPLOYEE_ID,
    originalName: "offer-letter.pdf",
    storedName: "stored-document.pdf",
    mimeType: "application/pdf",
    size: 1024,
    sourceKey: "offer:" + EMPLOYEE_ID + ":template-v1"
});

const validExpenseClaim = () => new ExpenseClaim({
    employee: EMPLOYEE_ID,
    category: "travel",
    amount: 1250,
    expenseDate: new Date("2026-11-01T00:00:00.000Z"),
    description: "Client visit travel",
    receiptOriginalName: "receipt.pdf",
    receiptStoredName: "stored-receipt.pdf",
    receiptMimeType: "application/pdf",
    receiptSize: 2048
});

const assertLocalStorageDefaults = (record) => {
    assert.equal(record.storageProvider, "local");
    assert.equal(record.storageMigrationStatus, "not_started");
    assert.equal(record.googleDriveFileId, null);
    assert.equal(record.googleDriveChecksumSha256, null);
    assert.equal(record.googleDriveVerifiedAt, null);
    assert.equal(record.storageMigrationError, "");
    assert.equal(record.validateSync(), undefined);
};

test("employee documents retain local storage defaults for existing records", () => {
    assertLocalStorageDefaults(validEmployeeDocument());
});

test("expense receipts retain local storage defaults for existing records", () => {
    assertLocalStorageDefaults(validExpenseClaim());
});

test("employee document accepts verified Google Drive metadata without changing source key", () => {
    const document = validEmployeeDocument();
    const sourceKey = document.sourceKey;
    document.storageProvider = "google_drive";
    document.storageMigrationStatus = "verified";
    document.googleDriveFileId = "drive-file-id-123";
    document.googleDriveChecksumSha256 = "a".repeat(64);
    document.googleDriveVerifiedAt = new Date("2026-11-18T08:00:00.000Z");

    assert.equal(document.validateSync(), undefined);
    assert.equal(document.sourceKey, sourceKey);
    assert.equal(document.googleDriveFileId, "drive-file-id-123");
});

test("expense receipt accepts verified Google Drive metadata", () => {
    const claim = validExpenseClaim();
    claim.storageProvider = "google_drive";
    claim.storageMigrationStatus = "verified";
    claim.googleDriveFileId = "drive-receipt-id-456";
    claim.googleDriveChecksumSha256 = "b".repeat(64);
    claim.googleDriveVerifiedAt = new Date("2026-11-18T08:00:00.000Z");

    assert.equal(claim.validateSync(), undefined);
    assert.equal(claim.storageProvider, "google_drive");
});

test("storage metadata rejects unsupported providers and migration states", () => {
    const document = validEmployeeDocument();
    document.storageProvider = "dropbox";
    document.storageMigrationStatus = "complete";

    const error = document.validateSync();
    assert.ok(error);
    assert.ok(error.errors.storageProvider);
    assert.ok(error.errors.storageMigrationStatus);
});

test("storage metadata rejects malformed Google Drive checksums", () => {
    const claim = validExpenseClaim();
    claim.googleDriveChecksumSha256 = "not-a-sha256";

    const error = claim.validateSync();
    assert.ok(error);
    assert.ok(error.errors.googleDriveChecksumSha256);
});
