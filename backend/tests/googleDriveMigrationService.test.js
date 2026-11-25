import test from "node:test";
import assert from "node:assert/strict";
import EmployeeDocument from "../src/models/EmployeeDocument.js";
import ExpenseClaim from "../src/models/ExpenseClaim.js";
import { __private } from "../src/services/googleDriveMigrationService.js";

test("migration claims only local records that are pending, failed, or stale in-progress", () => {
    const staleBefore = new Date("2026-11-18T10:00:00.000Z");
    const query = __private.migrationQuery(staleBefore);
    assert.equal(query.storageProvider, "local");
    assert.equal(query.googleDriveFileId, null);
    assert.deepEqual(query.$or[0], { storageMigrationStatus: { $in: ["not_started", "failed"] } });
    assert.deepEqual(query.$or[1], {
        storageMigrationStatus: "in_progress",
        updatedAt: { $lt: staleBefore }
    });
});

test("employee document migration preserves the original local storage key", () => {
    const record = new EmployeeDocument({
        employee: "64b000000000000000000061",
        originalName: "offer.pdf",
        storedName: "uuid-offer.pdf",
        mimeType: "application/pdf",
        size: 128
    });
    assert.equal(record.storageMigrationStartedAt, null);
    assert.equal(__private.getRecordConfig("employee_document").storedNameField, "storedName");
    assert.equal(__private.getRecordConfig("employee_document").storageDir.endsWith("employee-documents"), true);
    assert.deepEqual(__private.getRecordConfig("employee_document").appProperties(record), {
        hrmsDocumentId: String(record._id),
        hrmsStorageKind: "employee_document"
    });
});

test("expense receipt migration maps the original receipt fields and identity", () => {
    const record = new ExpenseClaim({
        employee: "64b000000000000000000071",
        category: "travel",
        amount: 1250,
        expenseDate: new Date("2026-11-01T00:00:00.000Z"),
        description: "Client travel",
        receiptOriginalName: "receipt.pdf",
        receiptStoredName: "uuid-receipt.pdf",
        receiptMimeType: "application/pdf",
        receiptSize: 256
    });
    assert.equal(record.storageMigrationStartedAt, null);
    assert.equal(__private.getRecordConfig("expense_receipt").storedNameField, "receiptStoredName");
    assert.equal(__private.getRecordConfig("expense_receipt").storageDir.endsWith("expense-receipts"), true);
    assert.deepEqual(__private.getRecordConfig("expense_receipt").appProperties(record), {
        hrmsExpenseClaimId: String(record._id),
        hrmsStorageKind: "expense_receipt"
    });
});

test("migration claim timeout is bounded to a retryable stale interval", () => {
    assert.equal(__private.STALE_CLAIM_MS, 15 * 60 * 1000);
});
