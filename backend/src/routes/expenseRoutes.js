import express from "express";
import {
    getExpenseWorkspace,
    createExpenseClaim,
    reviewExpenseClaim,
    reimburseExpenseClaim,
    downloadExpenseReceipt,
    saveExpenseLimit
} from "../controllers/expenseController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadExpenseReceipt } from "../middleware/expenseReceiptUpload.js";
import { auditAction } from "../middleware/auditLogMiddleware.js";

const router = express.Router();

const handleReceiptUpload = (req, res, next) => {
    uploadExpenseReceipt(req, res, (error) => {
        if (!error) return next();
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.code ? 500 : 400;
        return res.status(status).json({
            success: false,
            message: error.code === "LIMIT_FILE_SIZE"
                ? "Receipt must be 10 MB or smaller"
                : error.code
                    ? "Unable to store receipt"
                    : "Only PDF, JPG and PNG receipts are allowed"
        });
    });
};

router.use(protect);
router.get("/", getExpenseWorkspace);
router.post("/claims", handleReceiptUpload, auditAction("expenses", "expense.claim_created"), createExpenseClaim);
router.get("/claims/:id/receipt", downloadExpenseReceipt);
router.patch("/claims/:id/review", authorizeRoles("admin", "hr"), auditAction("expenses", "expense.claim_reviewed"), reviewExpenseClaim);
router.patch("/claims/:id/reimburse", authorizeRoles("admin", "hr"), auditAction("expenses", "expense.reimbursed"), reimburseExpenseClaim);
router.put("/limits/:category", authorizeRoles("admin", "hr"), auditAction("expenses", "expense.limit_updated"), saveExpenseLimit);

export default router;
