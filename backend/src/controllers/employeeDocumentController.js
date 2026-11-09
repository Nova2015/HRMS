import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import EmployeeDocument from "../models/EmployeeDocument.js";
import Employee from "../models/Employee.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png"
]);

const removeUploadedFile = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Unable to remove rejected document:", error.message);
        }
    }
};

const hasValidFileSignature = async (filePath, mimeType) => {
    const handle = await fs.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(8);
        const { bytesRead } = await handle.read(buffer, 0, 8, 0);
        const header = buffer.subarray(0, bytesRead);
        if (mimeType === "application/pdf") return header.subarray(0, 5).toString() === "%PDF-";
        if (mimeType === "image/jpeg") return header.length >= 3 &&
            header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        if (mimeType === "image/png") return header.length >= 8 &&
            header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        return false;
    } finally {
        await handle.close();
    }
};

const safeOriginalName = (name) =>
    path.win32.basename(path.basename(String(name || "document")))
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 255) || "document";

const populateDocument = (query) =>
    query.populate("employee", "employeeCode firstName lastName email");

export const uploadMyDocument = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({
            success: false,
            message: "Choose a PDF, JPG or PNG document to upload"
        });
    }

    try {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype) ||
            file.size < 1 || file.size > MAX_FILE_SIZE ||
            !(await hasValidFileSignature(file.path, file.mimetype))) {
            await removeUploadedFile(file.path);
            return res.status(400).json({
                success: false,
                message: "The file content is invalid or its format is not supported"
            });
        }

        const employee = await Employee.findById(req.user.employeeId)
            .select("_id employmentStatus");
        if (!employee || employee.employmentStatus !== "active") {
            await removeUploadedFile(file.path);
            return res.status(403).json({
                success: false,
                message: "An active employee account is required"
            });
        }

        const document = await EmployeeDocument.create({
            employee: employee._id,
            originalName: safeOriginalName(file.originalname),
            storedName: path.basename(file.filename),
            mimeType: file.mimetype,
            size: file.size
        });

        const data = await populateDocument(
            EmployeeDocument.findById(document._id)
        );

        return res.status(201).json({
            success: true,
            message: "Document sent to HR successfully",
            data
        });
    } catch (error) {
        await removeUploadedFile(file.path);
        console.error("Upload employee document error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to submit document"
        });
    }
};

export const getMyDocuments = async (req, res) => {
    try {
        const data = await EmployeeDocument.find({
            employee: req.user.employeeId
        }).sort({ createdAt: -1 }).limit(100);

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error("Get my documents error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to load your documents"
        });
    }
};

export const getAllEmployeeDocuments = async (req, res) => {
    try {
        const data = await populateDocument(
            EmployeeDocument.find({})
                .sort({ createdAt: -1 })
                .limit(500)
        );

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error("Get employee documents error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to load employee documents"
        });
    }
};

export const downloadEmployeeDocument = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid document ID"
            });
        }

        const document = await EmployeeDocument.findById(id).select(
            "employee originalName storedName mimeType"
        );
        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found"
            });
        }

        const isPrivileged = ["admin", "hr"].includes(req.user.role);
        const isOwner = document.employee.toString() === req.user.employeeId;
        if (!isPrivileged && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to access this document"
            });
        }

        const filePath = path.join(DOCUMENT_STORAGE_DIR, path.basename(document.storedName));
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({
                success: false,
                message: "Stored document file was not found"
            });
        }

        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", document.mimeType);
        return res.download(filePath, safeOriginalName(document.originalName));
    } catch (error) {
        console.error("Download employee document error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to download document"
        });
    }
};
