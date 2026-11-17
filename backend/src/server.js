import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";

import connectDB from "./config/database.js";
import { seedRecruitmentMasters } from "./config/seedRecruitmentMasters.js";
import { createGracefulShutdown } from "./utils/gracefulShutdown.js";
import { getDatabaseReadiness } from "./utils/databaseReadiness.js";

// Routes
import departmentRoutes from "./routes/departmentRoutes.js";
import designationRoutes from "./routes/designationRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import leaveAllocationRoutes from "./routes/leaveAllocationRoutes.js";
import holidayRoutes from "./routes/holidayRoutes.js";
import shiftRoutes from "./routes/shiftRoutes.js";
import payrollRoutes from "./routes/payrollRoutes.js";
import employeeDocumentRoutes from "./routes/employeeDocumentRoutes.js";
import employeeHrDetailsRoutes from "./routes/employeeHrDetailsRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import helpdeskRoutes from "./routes/helpdeskRoutes.js";
import recruitmentRoutes from "./routes/recruitmentRoutes.js";
import googleIntegrationRoutes from "./routes/googleIntegrationRoutes.js";
import employeeUpdateApprovalRoutes from "./routes/employeeUpdateApprovalRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";
import performanceRoutes from "./routes/performanceRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import auditLogRoutes from "./routes/auditLogRoutes.js";
import companyEventRoutes from "./routes/companyEventRoutes.js";

const app = express();

// Render terminates TLS and forwards requests through one trusted proxy.
// This makes req.ip use the forwarded client IP for rate limiting and logs.
app.set("trust proxy", 1);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    console.error("Startup blocked: JWT_SECRET must be configured with at least 32 characters.");
    process.exit(1);
}

app.use(helmet());

const allowedOrigins = new Set([
    "https://hrms-frontend-tawny-pi.vercel.app",
    ...(process.env.CLIENT_URL || "").split(",").map((url) => url.trim()).filter(Boolean)
]);

app.use(cors({
    origin: (origin, callback) => {
        // Allow the production frontend, explicitly configured CLIENT_URL values,
        // and this project's Vercel preview deployments only.
        const isHrmsVercelPreview =
            typeof origin === "string" &&
            /^https:\/\/hrms-[a-z0-9-]+-nova2015s-projects\.vercel\.app$/.test(origin);

        if (!origin || allowedOrigins.has(origin) || isHrmsVercelPreview) {
            return callback(null, true);
        }
        return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "HRMS Backend is running",
        database: "MongoDB",
        environment: process.env.NODE_ENV
    });
});

// Readiness check for orchestrators and deployment monitoring.
// Keep /api/health as a liveness check so transient DB outages do not
// cause platforms to restart an otherwise healthy Node.js process.
app.get("/api/ready", (req, res) => {
    const readiness = getDatabaseReadiness(mongoose.connection.readyState);
    res.status(readiness.ready ? 200 : 503).json({
        success: readiness.ready,
        status: readiness.ready ? "ready" : "not_ready",
        database: readiness.database
    });
});

app.use("/api/departments", departmentRoutes);
app.use("/api/designations", designationRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/employee-hr-details", employeeHrDetailsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/leave-allocations", leaveAllocationRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/documents", employeeDocumentRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/helpdesk", helpdeskRoutes);
app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/integrations/google", googleIntegrationRoutes);
app.use("/api/employee-update-approvals", employeeUpdateApprovalRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/calendar/events", companyEventRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.status ? err.message : "Internal Server Error"
    });
});

const startServer = async () => {
    try {
        await connectDB();
        await seedRecruitmentMasters();
        const PORT = process.env.PORT || 5000;
        const server = app.listen(PORT, () => {
            console.log("-----------------------------------");
            console.log("HRMS BACKEND STARTED SUCCESSFULLY");
            console.log(`Server: http://localhost:${PORT}`);
            console.log(`Health: http://localhost:${PORT}/api/health`);
            console.log("-----------------------------------");
        });

        const shutdown = createGracefulShutdown({
            server,
            disconnect: () => mongoose.disconnect()
        });

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
