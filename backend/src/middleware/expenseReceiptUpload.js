import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";

export const EXPENSE_RECEIPT_STORAGE_DIR = path.resolve(
    process.cwd(),
    "private_uploads",
    "expense-receipts"
);

const allowedTypes = new Map([
    ["application/pdf", ".pdf"],
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"]
]);

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        fs.mkdir(EXPENSE_RECEIPT_STORAGE_DIR, { recursive: true }, (error) => {
            callback(error, EXPENSE_RECEIPT_STORAGE_DIR);
        });
    },
    filename: (req, file, callback) => {
        callback(null, `${randomUUID()}${allowedTypes.get(file.mimetype) || ".upload"}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5, parts: 6 },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const expected = allowedTypes.get(file.mimetype);
        if (!expected || (extension !== expected && !(file.mimetype === "image/jpeg" && extension === ".jpeg"))) {
            return callback(new Error("Only PDF, JPG and PNG receipts are allowed"));
        }
        callback(null, true);
    }
});

export const uploadExpenseReceipt = upload.single("receipt");
