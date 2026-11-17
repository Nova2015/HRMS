import express from "express";
import {
    uploadMyDocument,
    issueDocumentToEmployee,
    generateAppointmentLetter,
    generateEmploymentDocument,
    getMyDocuments,
    getAllEmployeeDocuments,
    reviewEmployeeDocument,
    downloadEmployeeDocument
} from "../controllers/employeeDocumentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadEmployeeDocument } from "../middleware/documentUpload.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

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
router.post("/my", auditAction("employee_documents", "employee.document_submitted"), handleDocumentUpload, uploadMyDocument);
router.post("/issue", authorizeRoles("admin", "hr"), auditAction("employee_documents", "employee.document_issued"), handleDocumentUpload, issueDocumentToEmployee);
router.post("/generate/:employeeId/appointment", authorizeRoles("admin", "hr"), auditAction("employee_documents", "employee.appointment_letter_generated"), generateAppointmentLetter);
router.post("/generate/:employeeId/:documentType", authorizeRoles("admin", "hr"), auditAction("employee_documents", "employee.employment_document_generated"), generateEmploymentDocument);
router.get("/my", getMyDocuments);
router.get("/", authorizeRoles("admin", "hr"), getAllEmployeeDocuments);
router.patch("/:id/review", authorizeRoles("admin", "hr"), auditAction("employee_documents", "employee.document_reviewed"), reviewEmployeeDocument);
router.get("/:id/download", downloadEmployeeDocument);

export default router;
