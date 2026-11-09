import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import EmployeeDocument from "../models/EmployeeDocument.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";

const money = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const safeText = (value) => String(value ?? "-").replace(/[\\r\\n]+/g, " ").slice(0, 500);

const writePdf = async (filePath, title, employee, sections) => {
    await fs.mkdir(DOCUMENT_STORAGE_DIR, { recursive: true });
    await new Promise((resolve, reject) => {
        const output = createWriteStream(filePath, { flags: "wx" });
        const pdf = new PDFDocument({ size: "A4", margin: 48, info: { Title: title, Author: "HRMS" } });
        output.on("finish", resolve);
        output.on("error", reject);
        pdf.on("error", reject);
        pdf.pipe(output);

        pdf.font("Helvetica-Bold").fontSize(18).text("HRMS", { align: "center" });
        pdf.moveDown(0.3);
        pdf.fontSize(15).text(title, { align: "center" });
        pdf.moveDown();
        pdf.font("Helvetica").fontSize(10);
        pdf.text("Employee: " + safeText(employee.firstName + " " + employee.lastName));
        pdf.text("Employee Code: " + safeText(employee.employeeCode));
        pdf.text("Email: " + safeText(employee.email));
        pdf.moveDown();

        for (const section of sections) {
            pdf.font("Helvetica-Bold").fontSize(11).text(safeText(section.heading));
            pdf.moveDown(0.25);
            pdf.font("Helvetica").fontSize(10);
            for (const [label, value] of section.rows) {
                pdf.text(safeText(label) + ": " + safeText(value));
            }
            pdf.moveDown(0.7);
        }

        pdf.moveDown();
        pdf.fontSize(8).fillColor("gray").text("This is a system-generated document. Please contact HR for corrections.", { align: "center" });
        pdf.end();
    });
};

export const createGeneratedEmployeeDocument = async ({
    employee,
    documentType,
    title,
    sourceKey,
    sections,
    issuedBy = null
}) => {
    if (!employee?._id || !sourceKey) throw new Error("Employee and source key are required");
    const existing = await EmployeeDocument.findOne({ sourceKey });
    if (existing) return existing;

    const storedName = randomUUID() + ".pdf";
    const filePath = path.join(DOCUMENT_STORAGE_DIR, storedName);
    try {
        await writePdf(filePath, title, employee, sections);
        const stats = await fs.stat(filePath);
        return await EmployeeDocument.create({
            employee: employee._id,
            originalName: title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 180) + ".pdf",
            storedName,
            mimeType: "application/pdf",
            size: stats.size,
            documentType,
            direction: "hr_to_employee",
            status: "issued",
            issuedBy,
            sourceKey
        });
    } catch (error) {
        await fs.unlink(filePath).catch(() => {});
        if (error.code === 11000) {
            const duplicate = await EmployeeDocument.findOne({ sourceKey });
            if (duplicate) return duplicate;
        }
        throw error;
    }
};

export const generatePayslipDocument = async (payroll, issuedBy = null) => {
    const employee = payroll?.employee;
    if (!employee?._id) throw new Error("Payroll employee details are unavailable");
    const month = new Date(payroll.period + "-01T00:00:00.000Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    const earnings = (payroll.earnings || []).map((line) => [line.name, money(line.amount)]);
    const deductions = (payroll.deductions || []).map((line) => [line.name, money(line.amount)]);
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "payslip",
        title: "Monthly Payslip - " + month,
        sourceKey: "payroll:" + payroll._id,
        issuedBy,
        sections: [
            { heading: "Pay Period", rows: [["Month", month], ["Working Days", payroll.workingDays], ["Paid Days", payroll.paidDays]] },
            { heading: "Earnings", rows: [["Basic Salary", money(payroll.basic)], ...earnings, ["Gross Earnings", money(payroll.grossEarnings)]] },
            { heading: "Deductions", rows: [...deductions, ["Total Deductions", money(payroll.totalDeductions)]] },
            { heading: "Net Pay", rows: [["Net Payable", money(payroll.netPay)], ["Payment Status", payroll.status], ["Paid Date", payroll.paidAt ? new Date(payroll.paidAt).toLocaleDateString("en-IN") : "-"]] }
        ]
    });
};

export const generateLeaveDecisionDocument = async (leave, decision, issuedBy = null) => {
    const employee = leave?.employee;
    if (!employee?._id) throw new Error("Leave employee details are unavailable");
    const approved = decision === "approved";
    const dateRange = leave.startDate + " to " + leave.endDate;
    return createGeneratedEmployeeDocument({
        employee,
        documentType: approved ? "leave_letter" : "leave_rejection_notice",
        title: approved ? "Leave Approval Letter" : "Leave Rejection Notice",
        sourceKey: "leave:" + leave._id + ":" + decision,
        issuedBy,
        sections: [
            { heading: "Leave Details", rows: [["Leave Type", leave.leaveType], ["Leave Dates", dateRange], ["Working Days", leave.totalDays], ["Decision", approved ? "Approved" : "Rejected"]] },
            { heading: "HR Review", rows: [["Review Comment", leave.reviewComment || "No additional comment"], ["Decision Date", leave.reviewedAt ? new Date(leave.reviewedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")]] }
        ]
    });
};


export const generateSalaryRevisionDocument = async (employee, previousStructure, currentStructure, issuedBy = null) => {
    if (!employee?._id || !previousStructure || !currentStructure) {
        throw new Error("Employee and both salary structure versions are required");
    }
    const effectiveDate = new Date(currentStructure.effectiveFrom).toISOString().slice(0, 10);
    const snapshot = {
        effectiveDate,
        previous: {
            monthlyBasic: previousStructure.monthlyBasic,
            earnings: (previousStructure.earnings || []).map(({ name, amount }) => ({ name, amount })),
            deductions: (previousStructure.deductions || []).map(({ name, amount }) => ({ name, amount }))
        },
        current: {
            monthlyBasic: currentStructure.monthlyBasic,
            earnings: (currentStructure.earnings || []).map(({ name, amount }) => ({ name, amount })),
            deductions: (currentStructure.deductions || []).map(({ name, amount }) => ({ name, amount }))
        }
    };
    const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const lines = (items) => items.length
        ? items.map((item) => [item.name, money(item.amount)])
        : [["Components", "None"]];
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "other",
        title: "Salary Revision Letter",
        sourceKey: "salary-revision:" + employee._id + ":" + effectiveDate + ":" + fingerprint,
        issuedBy,
        sections: [
            { heading: "Revision Details", rows: [["Effective From", effectiveDate], ["Currency", "INR"]] },
            { heading: "Previous Salary Structure", rows: [["Monthly Basic", money(snapshot.previous.monthlyBasic)], ...lines(snapshot.previous.earnings), ...snapshot.previous.deductions.map((item) => ["Deduction - " + item.name, money(item.amount)])] },
            { heading: "Revised Salary Structure", rows: [["Monthly Basic", money(snapshot.current.monthlyBasic)], ...lines(snapshot.current.earnings), ...snapshot.current.deductions.map((item) => ["Deduction - " + item.name, money(item.amount)])] }
        ]
    });
};

export const generateAppointmentLetterDocument = async (employee, issuedBy = null) => {
    if (!employee?._id) throw new Error("Employee details are required");
    const departmentName = employee.department?.name || "As assigned by HR";
    const designationName = employee.designation?.name || "As assigned by HR";
    const shiftName = employee.shift?.name || "As assigned by HR";
    const joiningDate = employee.joiningDate
        ? new Date(employee.joiningDate).toLocaleDateString("en-IN", { timeZone: "UTC" })
        : "-";
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "appointment_letter",
        title: "Appointment Letter",
        sourceKey: "appointment:" + employee._id,
        issuedBy,
        sections: [
            { heading: "Appointment Details", rows: [["Employee Code", employee.employeeCode], ["Designation", designationName], ["Department", departmentName], ["Date of Joining", joiningDate], ["Work Shift", shiftName], ["Employment Status", employee.employmentStatus || "active"]] },
            { heading: "Employment Confirmation", rows: [["Appointment", "You are appointed to the above position with effect from the date of joining recorded in HRMS."], ["Terms and Conditions", "Your employment will be governed by the company's applicable policies and terms communicated by HR."]] }
        ]
    });
};
