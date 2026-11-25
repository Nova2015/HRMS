import test from "node:test";
import assert from "node:assert/strict";
import ExpenseClaim from "../src/models/ExpenseClaim.js";

const baseClaim = {
    employee: "64b000000000000000000071",
    category: "travel",
    amount: 1250,
    expenseDate: new Date("2026-11-01T00:00:00.000Z"),
    description: "Client travel",
    receiptOriginalName: "receipt.pdf",
    receiptStoredName: "stored-receipt.pdf",
    receiptMimeType: "application/pdf",
    receiptSize: 256
};

test("expense receipt storage defaults preserve existing local behavior", () => {
    const claim = new ExpenseClaim(baseClaim);
    assert.equal(claim.storageProvider, "local");
    assert.equal(claim.storageMigrationStatus, "not_started");
    assert.equal(claim.googleDriveFileId, null);
    assert.equal(claim.googleDriveChecksumSha256, null);
    assert.equal(claim.googleDriveVerifiedAt, null);
    assert.equal(claim.storageMigrationError, "");
    assert.equal(claim.validateSync(), undefined);
});

test("expense receipt accepts verified Drive metadata without changing its local key", () => {
    const claim = new ExpenseClaim({
        ...baseClaim,
        storageProvider: "google_drive",
        storageMigrationStatus: "verified",
        googleDriveFileId: "drive-file-id_456",
        googleDriveChecksumSha256: "b".repeat(64),
        googleDriveVerifiedAt: new Date()
    });
    assert.equal(claim.validateSync(), undefined);
    assert.equal(claim.receiptStoredName, baseClaim.receiptStoredName);
    assert.equal(claim.receiptOriginalName, baseClaim.receiptOriginalName);
    assert.equal(claim.storageProvider, "google_drive");
});

test("expense receipt rejects malformed Drive checksums", () => {
    const claim = new ExpenseClaim({
        ...baseClaim,
        storageProvider: "google_drive",
        googleDriveChecksumSha256: "invalid-checksum"
    });
    assert.ok(claim.validateSync());
});
