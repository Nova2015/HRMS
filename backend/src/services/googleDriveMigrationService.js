import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import EmployeeDocument from "../models/EmployeeDocument.js";
import ExpenseClaim from "../models/ExpenseClaim.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";
import { EXPENSE_RECEIPT_STORAGE_DIR } from "../middleware/expenseReceiptUpload.js";
import {
    downloadCompanyDriveFile,
    findCompanyDriveFileByAppProperties,
    getCompanyDriveConnectionStatus,
    uploadCompanyDriveFile
} from "./googleDriveService.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const migrationQuery = (staleBefore) => ({
    storageProvider: "local",
    googleDriveFileId: null,
    $or: [
        { storageMigrationStatus: { $in: ["not_started", "failed"] } },
        { storageMigrationStatus: "in_progress", updatedAt: { $lt: staleBefore } }
    ]
});

const getRecordConfig = (kind) => kind === "employee_document"
    ? {
        Model: EmployeeDocument,
        storageDir: DOCUMENT_STORAGE_DIR,
        storedNameField: "storedName",
        originalNameField: "originalName",
        mimeTypeField: "mimeType",
        sizeField: "size",
        appProperties: (record) => ({
            hrmsDocumentId: String(record._id),
            hrmsStorageKind: "employee_document"
        })
    }
    : {
        Model: ExpenseClaim,
        storageDir: EXPENSE_RECEIPT_STORAGE_DIR,
        storedNameField: "receiptStoredName",
        originalNameField: "receiptOriginalName",
        mimeTypeField: "receiptMimeType",
        sizeField: "receiptSize",
        appProperties: (record) => ({
            hrmsExpenseClaimId: String(record._id),
            hrmsStorageKind: "expense_receipt"
        })
    };

const claimRecord = async (Model, id, now) => {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    return Model.findOneAndUpdate(
        { _id: id, ...migrationQuery(staleBefore) },
        {
            $set: {
                storageMigrationStatus: "in_progress",
                storageMigrationStartedAt: now,
                storageMigrationError: ""
            }
        },
        { new: true }
    );
};

const migrateOne = async (kind, id) => {
    const config = getRecordConfig(kind);
    const now = new Date();
    const record = await claimRecord(config.Model, id, now);
    if (!record) return { kind, id: String(id), status: "skipped", reason: "record_already_processed_or_claimed" };

    try {
        const storedName = path.basename(String(record[config.storedNameField] || ""));
        if (!storedName || storedName === "." || storedName === path.sep) {
            throw new Error("Stored filename is invalid; local file was not migrated");
        }
        const localPath = path.join(config.storageDir, storedName);
        const stat = await fs.stat(localPath);
        if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_BYTES) {
            throw new Error("Local file is missing, empty, or exceeds the 10 MB storage limit");
        }
        if (Number(record[config.sizeField]) !== stat.size) {
            throw new Error("Local file size does not match the MongoDB record; manual review is required");
        }
        const buffer = await fs.readFile(localPath);
        const checksum = sha256(buffer);
        const appProperties = config.appProperties(record);
        const existing = await findCompanyDriveFileByAppProperties(appProperties);
        let driveFile;
        if (existing) {
            const verifiedExisting = await downloadCompanyDriveFile({
                fileId: existing.id,
                expectedSha256: checksum,
                maxBytes: MAX_FILE_BYTES
            });
            if (verifiedExisting.size !== stat.size) {
                throw new Error("Existing Google Drive file size does not match the local original");
            }
            driveFile = { id: existing.id, sha256: checksum };
        } else {
            driveFile = await uploadCompanyDriveFile({
                buffer,
                fileName: String(record[config.originalNameField] || storedName).slice(0, 180),
                mimeType: record[config.mimeTypeField],
                appProperties
            });
            const verified = await downloadCompanyDriveFile({
                fileId: driveFile.id,
                expectedSha256: checksum,
                maxBytes: MAX_FILE_BYTES
            });
            if (verified.size !== stat.size || verified.sha256 !== checksum) {
                throw new Error("Google Drive verification did not match the local original");
            }
        }

        const update = await config.Model.updateOne(
            { _id: record._id, storageProvider: "local", storageMigrationStatus: "in_progress" },
            {
                $set: {
                    storageProvider: "google_drive",
                    storageMigrationStatus: "verified",
                    storageMigrationStartedAt: null,
                    googleDriveFileId: driveFile.id,
                    googleDriveChecksumSha256: checksum,
                    googleDriveVerifiedAt: new Date(),
                    storageMigrationError: ""
                }
            },
            { runValidators: true }
        );
        if (update.modifiedCount !== 1) {
            throw new Error("MongoDB record changed during migration; retry is required");
        }
        // Local original is deliberately retained. Cleanup is a separate, manual operation.
        return { kind, id: String(record._id), status: "verified", size: stat.size };
    } catch (error) {
        await config.Model.updateOne(
            { _id: record._id, storageProvider: "local", storageMigrationStatus: "in_progress" },
            {
                $set: {
                    storageMigrationStatus: "failed",
                    storageMigrationStartedAt: null,
                    storageMigrationError: String(error.message || "Migration failed").slice(0, 500)
                }
            },
            { runValidators: true }
        );
        console.error("Google Drive file migration failed:", { kind, recordId: String(record._id), message: error.message });
        return { kind, id: String(record._id), status: "failed", reason: String(error.message || "Migration failed").slice(0, 240) };
    }
};

export const getGoogleDriveMigrationSummary = async () => {
    const [documents, receipts, connection] = await Promise.all([
        EmployeeDocument.aggregate([
            { $group: { _id: { provider: "$storageProvider", status: "$storageMigrationStatus" }, count: { $sum: 1 } } }
        ]),
        ExpenseClaim.aggregate([
            { $group: { _id: { provider: "$storageProvider", status: "$storageMigrationStatus" }, count: { $sum: 1 } } }
        ]),
        getCompanyDriveConnectionStatus()
    ]);
    const summarize = (rows) => rows.map((row) => ({
        provider: row._id.provider || "local",
        status: row._id.status || "not_started",
        count: row.count
    }));
    return {
        driveConnected: connection.connected,
        googleEmail: connection.googleEmail,
        employeeDocuments: summarize(documents),
        expenseReceipts: summarize(receipts)
    };
};

export const runGoogleDriveMigrationBatch = async ({ limit = 10 } = {}) => {
    const batchLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 20) : 10;
    const connection = await getCompanyDriveConnectionStatus();
    if (!connection.connected) {
        const error = new Error("Connect the company Google Drive account before starting migration");
        error.status = 409;
        throw error;
    }

    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    const documentIds = await EmployeeDocument.find(migrationQuery(staleBefore))
        .sort({ createdAt: 1, _id: 1 }).limit(batchLimit).select("_id").lean();
    const remaining = batchLimit - documentIds.length;
    const receiptIds = remaining > 0
        ? await ExpenseClaim.find(migrationQuery(staleBefore))
            .sort({ createdAt: 1, _id: 1 }).limit(remaining).select("_id").lean()
        : [];
    const results = [];
    for (const item of documentIds) results.push(await migrateOne("employee_document", item._id));
    for (const item of receiptIds) results.push(await migrateOne("expense_receipt", item._id));

    return {
        batchLimit,
        processed: results.length,
        verified: results.filter((item) => item.status === "verified").length,
        failed: results.filter((item) => item.status === "failed").length,
        skipped: results.filter((item) => item.status === "skipped").length,
        results
    };
};

export const __private = { migrationQuery, getRecordConfig, claimRecord, migrateOne, STALE_CLAIM_MS };
