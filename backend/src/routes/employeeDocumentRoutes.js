import express from "express";
import {
    uploadMyDocument,
    getMyDocuments,
    getAllEmployeeDocuments,
    downloadEmployeeDocument
} from "../controllers/employeeDocumentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadEmployeeDocument } from "../middleware/documentUpload.js";

const router = express.Router();

router.use(protect);
router.post("/my", (req, res, next) => {
    uploadEmployeeDocument(req, res, (error) => {
        if (!error) return next();
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return res.status(status).json({
            success: false,
            message: error.code === "LIMIT_FILE_SIZE"
                ? "Document must be 10 MB or smaller"
                : error.message || "Unable to upload document"
        });
    });
}, uploadMyDocument);
router.get("/my", getMyDocuments);
router.get("/", authorizeRoles("admin", "hr"), getAllEmployeeDocuments);
router.get("/:id/download", downloadEmployeeDocument);

export default router;
