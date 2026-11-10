import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import connectDB from "./config/database.js";
import { seedRecruitmentMasters } from "./config/seedRecruitmentMasters.js";

// Routes
import departmentRoutes from "./routes/departmentRoutes.js";
import designationRoutes from "./routes/designationRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
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
import performanceRoutes from "./routes/performanceRoutes.js";

const app = express();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    console.error("Startup blocked: JWT_SECRET must be configured with at least 32 characters.");
    process.exit(1);
}

app.use(helmet());

app.use(cors({
    origin: process.env.CLIENT_URL,
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

app.use("/api/departments", departmentRoutes);
app.use("/api/designations", designationRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/employee-hr-details", employeeHrDetailsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/documents", employeeDocumentRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/helpdesk", helpdeskRoutes);
app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/integrations/google", googleIntegrationRoutes);
app.use("/api/employee-update-approvals", employeeUpdateApprovalRoutes);
app.use("/api/performance", performanceRoutes);

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
        app.listen(PORT, () => {
            console.log("-----------------------------------");
            console.log("HRMS BACKEND STARTED SUCCESSFULLY");
            console.log(`Server: http://localhost:${PORT}`);
            console.log(`Health: http://localhost:${PORT}/api/health`);
            console.log("-----------------------------------");
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
