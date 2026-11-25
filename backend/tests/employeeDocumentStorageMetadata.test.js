import test from "node:test";
import assert from "node:assert/strict";
import EmployeeDocument from "../src/models/EmployeeDocument.js";

const baseDocument = {
    employee: "64b000000000000000000061",
    originalName: "employee-record.pdf",
    storedName: "stored-record.pdf",
    mimeType: "application/pdf",
    size: 128
};

test("employee document storage defaults preserve local storage behavior", () => {
    const document = new EmployeeDocument(baseDocument);
    assert.equal(document.storageProvider, "local");
    assert.equal(document.storageMigrationStatus, "not_started");
    assert.equal(document.googleDriveFileId, null);
    assert.equal(document.googleDriveChecksumSha256, null);
    assert.equal(document.googleDriveVerifiedAt, null);
    assert.equal(document.storageMigrationError, "");
    assert.equal(document.validateSync(), undefined);
});

test("employee document accepts verified Google Drive metadata without changing local identity", () => {
    const document = new EmployeeDocument({
        ...baseDocument,
        storageProvider: "google_drive",
        storageMigrationStatus: "verified",
        googleDriveFileId: "drive-file-id_123",
        googleDriveChecksumSha256: "a".repeat(64),
        googleDriveVerifiedAt: new Date()
    });
    assert.equal(document.validateSync(), undefined);
    assert.equal(document.storedName, baseDocument.storedName);
    assert.equal(document.originalName, baseDocument.originalName);
    assert.equal(document.storageProvider, "google_drive");
});

test("employee document rejects malformed Google Drive checksums", () => {
    const document = new EmployeeDocument({
        ...baseDocument,
        storageProvider: "google_drive",
        googleDriveChecksumSha256: "not-a-sha256"
    });
    assert.ok(document.validateSync());
});
