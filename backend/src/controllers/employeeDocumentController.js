import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getCompanyDriveConnectionStatus, uploadCompanyDriveFile, downloadCompanyDriveFile } from "../services/googleDriveService.js";
import mongoose from "mongoose";
import EmployeeDocument from "../models/EmployeeDocument.js";
import Employee from "../models/Employee.js";
import {
    generateAppointmentLetterDocument,
    generateOfferLetterDocument,
    generateConfirmationLetterDocument
} from "../services/employeeDocumentGenerator.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const DOCUMENT_TYPES = new Set(["other", "resignation_letter", "payslip", "appointment_letter", "offer_letter", "confirmation_letter", "salary_revision_letter", "leave_letter", "leave_rejection_notice", "relieving_letter"]);
const HR_ISSUED_TYPES = new Set(["payslip", "appointment_letter", "offer_letter", "confirmation_letter", "salary_revision_letter", "leave_letter", "leave_rejection_notice", "relieving_letter", "other"]);

const removeUploadedFile = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") console.error("Unable to remove rejected document:", error.message);
    }
};

const hasValidFileSignature = async (filePath, mimeType) => {
    const handle = await fs.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(8);
        const { bytesRead } = await handle.read(buffer, 0, 8, 0);
        const header = buffer.subarray(0, bytesRead);
        if (mimeType === "application/pdf") return header.subarray(0, 5).toString() === "%PDF-";
        if (mimeType === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        if (mimeType === "image/png") return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        return false;
    } finally {
        await handle.close();
    }
};

const safeOriginalName = (name) =>
    path.win32.basename(path.basename(String(name || "document")))
        .replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "document";

const populateDocument = (query) =>
    query.populate("employee", "employeeCode firstName lastName email");

const createStoredEmployeeDocument = async ({ file, employee, documentType, direction, status, issuedBy = null }) => {
    const document = await EmployeeDocument.create({
        employee,
        originalName: safeOriginalName(file.originalname),
        storedName: path.basename(file.filename),
        mimeType: file.mimetype,
        size: file.size,
        documentType,
        direction,
        status,
        issuedBy,
        storageProvider: "local",
        storageMigrationStatus: "not_started"
    });

    let storageWarning = null;
    let driveStatus = { connected: false };
    try {
        driveStatus = await getCompanyDriveConnectionStatus();
    } catch (error) {
        storageWarning = "Document was saved locally, but Google Drive status could not be checked. The local copy has been retained.";
        await EmployeeDocument.updateOne(
            { _id: document._id },
            {
                $set: {
                    storageMigrationStatus: "failed",
                    storageMigrationError: String(error.message || "Google Drive status check failed").slice(0, 500)
                }
            }
        );
        console.error("Employee document Google Drive status check failed:", error.message);
    }
    if (driveStatus.connected) {
        try {
            await EmployeeDocument.updateOne(
                { _id: document._id },
                { $set: { storageMigrationStatus: "in_progress", storageMigrationError: "" } }
            );
            const buffer = await fs.readFile(file.path);
            const uploaded = await uploadCompanyDriveFile({
                buffer,
                fileName: safeOriginalName(file.originalname),
                mimeType: file.mimetype,
                appProperties: {
                    hrmsDocumentId: String(document._id),
                    hrmsDocumentType: String(documentType),
                    hrmsStorageKind: "employee_document"
                }
            });
            const verified = await downloadCompanyDriveFile({
                fileId: uploaded.id,
                expectedSha256: uploaded.sha256,
                maxBytes: MAX_FILE_SIZE
            });
            if (verified.size !== file.size || verified.sha256 !== uploaded.sha256) {
                throw new Error("Google Drive verification did not match the uploaded document");
            }
            await EmployeeDocument.updateOne(
                { _id: document._id },
                {
                    $set: {
                        storageProvider: "google_drive",
                        storageMigrationStatus: "verified",
                        googleDriveFileId: uploaded.id,
                        googleDriveChecksumSha256: uploaded.sha256,
                        googleDriveVerifiedAt: new Date(),
                        storageMigrationError: ""
                    }
                },
                { runValidators: true }
            );
        } catch (error) {
            storageWarning = "Document was saved locally, but Google Drive upload or verification failed. The local copy has been retained.";
            await EmployeeDocument.updateOne(
                { _id: document._id },
                {
                    $set: {
                        storageProvider: "local",
                        storageMigrationStatus: "failed",
                        storageMigrationError: String(error.message || "Google Drive upload failed").slice(0, 500)
                    }
                },
                { runValidators: true }
            );
            console.error("Employee document Google Drive upload failed:", error.message);
        }
    }

    return { document, storageWarning };
};

const includeFileAvailability = async (documents) => Promise.all(
    documents.map(async (document) => {
        const record = document.toObject();
        if (record.storageProvider === "google_drive" && record.googleDriveFileId) {
            record.fileAvailable = record.storageMigrationStatus === "verified";
            return record;
        }
        const filePath = path.join(DOCUMENT_STORAGE_DIR, path.basename(record.storedName || ""));
        try {
            await fs.access(filePath);
            record.fileAvailable = true;
        } catch {
            record.fileAvailable = false;
        }
        return record;
    })
);

const validateUploadedFile = async (file, res) => {
    if (!file) {
        res.status(400).json({ success: false, message: "Choose a PDF, JPG or PNG document" });
        return false;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || file.size < 1 || file.size > MAX_FILE_SIZE ||
        !(await hasValidFileSignature(file.path, file.mimetype))) {
        await removeUploadedFile(file.path);
        res.status(400).json({ success: false, message: "The file content is invalid or its format is not supported" });
        return false;
    }
    return true;
};

export const uploadMyDocument = async (req, res) => {
    const file = req.file;
    try {
        if (!(await validateUploadedFile(file, res))) return;
        const employee = await Employee.findById(req.user.employeeId).select("_id employmentStatus");
        if (!employee || employee.employmentStatus !== "active") {
            await removeUploadedFile(file.path);
            return res.status(403).json({ success: false, message: "An active employee account is required" });
        }
        const documentType = String(req.body?.documentType || "other");
        if (!["other", "resignation_letter"].includes(documentType)) {
            await removeUploadedFile(file.path);
            return res.status(400).json({ success: false, message: "Employees can submit only supporting documents or resignation letters" });
        }
        const { document, storageWarning } = await createStoredEmployeeDocument({
            file,
            employee: employee._id,
            documentType,
            direction: "employee_to_hr",
            status: "pending"
        });
        const data = await populateDocument(EmployeeDocument.findById(document._id));
        return res.status(201).json({
            success: true,
            message: storageWarning || "Document sent to HR successfully",
            storageWarning,
            data
        });
    } catch (error) {
        const referenced = file?.filename
            ? await EmployeeDocument.exists({ storedName: path.basename(file.filename) }).catch(() => true)
            : false;
        if (!referenced) await removeUploadedFile(file?.path);
        console.error("Upload employee document error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to submit document" });
    }
};

export const issueDocumentToEmployee = async (req, res) => {
    const file = req.file;
    try {
        if (!(await validateUploadedFile(file, res))) return;
        const { employeeId, documentType } = req.body || {};
        if (!mongoose.isValidObjectId(employeeId)) {
            await removeUploadedFile(file.path);
            return res.status(400).json({ success: false, message: "Select a valid employee" });
        }
        if (!HR_ISSUED_TYPES.has(documentType)) {
            await removeUploadedFile(file.path);
            return res.status(400).json({ success: false, message: "Select a valid HR document type" });
        }
        const employee = await Employee.findOne({ _id: employeeId, employmentStatus: "active" }).select("_id");
        if (!employee) {
            await removeUploadedFile(file.path);
            return res.status(404).json({ success: false, message: "Active employee not found" });
        }
        if (documentType === "relieving_letter") {
            const approvedResignation = await EmployeeDocument.exists({
                employee: employee._id,
                direction: "employee_to_hr",
                documentType: "resignation_letter",
                status: "approved"
            });
            if (!approvedResignation) {
                await removeUploadedFile(file.path);
                return res.status(409).json({ success: false, message: "Approve the employee resignation before issuing a relieving letter" });
            }
        }
        const { document, storageWarning } = await createStoredEmployeeDocument({
            file,
            employee: employee._id,
            documentType,
            direction: "hr_to_employee",
            status: "issued",
            issuedBy: req.user.userId
        });
        const data = await populateDocument(EmployeeDocument.findById(document._id));
        return res.status(201).json({
            success: true,
            message: storageWarning || "Document sent to employee successfully",
            storageWarning,
            data
        });
    } catch (error) {
        const referenced = file?.filename
            ? await EmployeeDocument.exists({ storedName: path.basename(file.filename) }).catch(() => true)
            : false;
        if (!referenced) await removeUploadedFile(file?.path);
        console.error("Issue employee document error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to send document to employee" });
    }
};

export const generateAppointmentLetter = async (req, res) => {
    try {
        const { employeeId } = req.params;
        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID" });
        }
        const employee = await Employee.findOne({ _id: employeeId, employmentStatus: "active" })
            .populate("department", "name")
            .populate("designation", "name")
            .populate("shift", "name")
            .populate("reportingManager", "employeeCode firstName lastName");
        if (!employee) {
            return res.status(404).json({ success: false, message: "Active employee not found" });
        }
        const document = await generateAppointmentLetterDocument(employee, req.user.userId);
        const data = await populateDocument(EmployeeDocument.findById(document._id));
        return res.status(201).json({ success: true, message: "Appointment letter generated and issued successfully", data });
    } catch (error) {
        console.error("Generate appointment letter error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to generate appointment letter" });
    }
};

export const generateEmploymentDocument = async (req, res) => {
    try {
        const { employeeId, documentType } = req.params;
        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID" });
        }
        const generators = {
            appointment_letter: generateAppointmentLetterDocument,
            offer_letter: generateOfferLetterDocument,
            confirmation_letter: generateConfirmationLetterDocument
        };
        const generate = generators[documentType];
        if (!generate) {
            return res.status(400).json({ success: false, message: "Unsupported employment document type" });
        }
        const employee = await Employee.findOne({ _id: employeeId, employmentStatus: "active" })
            .populate("department", "name")
            .populate("designation", "name")
            .populate("shift", "name")
            .populate("reportingManager", "employeeCode firstName lastName");
        if (!employee) {
            return res.status(404).json({ success: false, message: "Active employee not found" });
        }
        const document = await generate(employee, req.user.userId);
        const data = await populateDocument(EmployeeDocument.findById(document._id));
        return res.status(201).json({ success: true, message: "Employment document generated and issued successfully", data });
    } catch (error) {
        console.error("Generate employment document error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to generate employment document" });
    }
};

export const getMyDocuments = async (req, res) => {
    try {
        const documents = await EmployeeDocument.find({ employee: req.user.employeeId }).sort({ createdAt: -1 }).limit(100);
        const data = await includeFileAvailability(documents);
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Get my documents error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load your documents" });
    }
};

export const getAllEmployeeDocuments = async (req, res) => {
    try {
        const documents = await populateDocument(EmployeeDocument.find({}).sort({ createdAt: -1 }).limit(500));
        const data = await includeFileAvailability(documents);
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Get employee documents error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load employee documents" });
    }
};

export const reviewEmployeeDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, reviewComment = "" } = req.body || {};
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid document ID" });
        if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ success: false, message: "Decision must be approved or rejected" });
        const comment = String(reviewComment).trim();
        if (comment.length > 1000) return res.status(400).json({ success: false, message: "Review comment cannot exceed 1000 characters" });

        const document = await EmployeeDocument.findOneAndUpdate(
            { _id: id, direction: "employee_to_hr", documentType: "resignation_letter", status: "pending" },
            { $set: { status: decision, reviewedBy: req.user.userId, reviewedAt: new Date(), reviewComment: comment } },
            { new: true, runValidators: true }
        );
        if (!document) {
            const exists = await EmployeeDocument.exists({ _id: id });
            return res.status(exists ? 409 : 404).json({ success: false, message: exists ? "Only pending resignation letters can be reviewed" : "Document not found" });
        }
        const data = await populateDocument(EmployeeDocument.findById(document._id));
        return res.status(200).json({ success: true, message: `Resignation ${decision} successfully`, data });
    } catch (error) {
        console.error("Review resignation document error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to review resignation document" });
    }
};

export const downloadEmployeeDocument = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid document ID" });
        const document = await EmployeeDocument.findById(id).select(
            "employee originalName storedName mimeType storageProvider storageMigrationStatus googleDriveFileId googleDriveChecksumSha256"
        );
        if (!document) return res.status(404).json({ success: false, message: "Document not found" });
        const isPrivileged = ["admin", "hr"].includes(req.user.role);
        const isOwner = document.employee.toString() === req.user.employeeId;
        if (!isPrivileged && !isOwner) return res.status(403).json({ success: false, message: "You do not have permission to access this document" });
        const filePath = path.join(DOCUMENT_STORAGE_DIR, path.basename(document.storedName || ""));
        if (document.storageProvider === "google_drive" && document.googleDriveFileId) {
            try {
                const remote = await downloadCompanyDriveFile({
                    fileId: document.googleDriveFileId,
                    expectedSha256: document.googleDriveChecksumSha256,
                    maxBytes: MAX_FILE_SIZE
                });
                res.setHeader("X-Content-Type-Options", "nosniff");
                res.setHeader("Content-Type", document.mimeType);
                res.setHeader("Content-Length", String(remote.size));
                res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName(document.originalName))}`);
                return res.send(remote.buffer);
            } catch (driveError) {
                let localBuffer;
                try {
                    localBuffer = await fs.readFile(filePath);
                } catch {
                    return res.status(driveError.status || 502).json({
                        success: false,
                        message: "Google Drive document is unavailable and no local recovery copy was found"
                    });
                }
                if (document.googleDriveChecksumSha256) {
                    const localChecksum = crypto.createHash("sha256").update(localBuffer).digest("hex");
                    if (localChecksum !== document.googleDriveChecksumSha256) {
                        return res.status(502).json({
                            success: false,
                            message: "Google Drive is unavailable and the local recovery copy failed checksum verification"
                        });
                    }
                }
                console.error("Google Drive document download failed; using retained local copy:", driveError.message);
                res.setHeader("X-Content-Type-Options", "nosniff");
                res.setHeader("Content-Type", document.mimeType);
                res.setHeader("Content-Length", String(localBuffer.length));
                res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName(document.originalName))}`);
                return res.send(localBuffer);
            }
        }
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ success: false, message: "Stored document file was not found" });
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", document.mimeType);
        return res.download(filePath, safeOriginalName(document.originalName));
    } catch (error) {
        console.error("Download employee document error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to download document" });
    }
};
