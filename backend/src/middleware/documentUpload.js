import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";

export const DOCUMENT_STORAGE_DIR = path.resolve(
    process.cwd(),
    "private_uploads",
    "employee-documents"
);

const allowedTypes = new Map([
    ["application/pdf", ".pdf"],
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"]
]);

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        fs.mkdir(DOCUMENT_STORAGE_DIR, { recursive: true }, (error) => {
            callback(error, DOCUMENT_STORAGE_DIR);
        });
    },
    filename: (req, file, callback) => {
        const extension = allowedTypes.get(file.mimetype);
        callback(null, `${randomUUID()}${extension || ".upload"}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 3,
        parts: 4
    },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const expectedExtension = allowedTypes.get(file.mimetype);
        if (!expectedExtension || (extension !== expectedExtension && !(file.mimetype === "image/jpeg" && extension === ".jpeg"))) {
            return callback(new Error("Only PDF, JPG and PNG documents are allowed"));
        }
        callback(null, true);
    }
});

export const uploadEmployeeDocument = upload.single("document");
