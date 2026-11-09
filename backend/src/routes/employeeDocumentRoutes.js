import express from "express";
import {
    uploadMyDocument,
    issueDocumentToEmployee,
    getMyDocuments,
    getAllEmployeeDocuments,
    reviewEmployeeDocument,
    downloadEmployeeDocument
} from "../controllers/employeeDocumentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadEmployeeDocument } from "../middleware/documentUpload.js";

const handleDocumentUpload = (req, res, next) => {
    uploadEmployeeDocument(req, res, (error) => {
        if (!error) return next();
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.code ? 500 : 400;
        return res.status(status).json({
            success: false,
            message: error.code === "LIMIT_FILE_SIZE"
                ? "Document must be 10 MB or smaller"
                : error.code
                    ? "Unable to store uploaded document"
                    : "Only PDF, JPG and PNG documents are allowed"
        });
    });
};

const router = express.Router();
router.use(protect);
router.post("/my", handleDocumentUpload, uploadMyDocument);
router.post("/issue", authorizeRoles("admin", "hr"), handleDocumentUpload, issueDocumentToEmployee);
router.get("/my", getMyDocuments);
router.get("/", authorizeRoles("admin", "hr"), getAllEmployeeDocuments);
router.patch("/:id/review", authorizeRoles("admin", "hr"), reviewEmployeeDocument);
router.get("/:id/download", downloadEmployeeDocument);

export default router;
