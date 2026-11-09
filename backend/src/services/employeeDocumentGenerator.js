import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import EmployeeDocument from "../models/EmployeeDocument.js";
import Employee from "../models/Employee.js";
import { decryptHrDetails } from "./hrDetailsCrypto.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";

const money = (value) => "INR " + new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const safeText = (value) => String(value ?? "-").replace(/[\\r\\n]+/g, " ").slice(0, 500);
const masked = (value) => value ? "*".repeat(Math.max(0, String(value).length - 4)) + String(value).slice(-4) : "-";

const writePdf = async (filePath, title, employee, sections, documentType) => {
    await fs.mkdir(DOCUMENT_STORAGE_DIR, { recursive: true });
    await new Promise((resolve, reject) => {
        const output = createWriteStream(filePath, { flags: "wx" });
        const pdf = new PDFDocument({ size: "A4", margin: 42, info: { Title: title, Author: "HRMS" } });
        output.on("finish", resolve);
        output.on("error", reject);
        pdf.on("error", reject);
        pdf.pipe(output);

        if (documentType !== "payslip") {
            pdf.font("Helvetica-Bold").fontSize(18).fillColor("#17365D").text("HRMS", { align: "center" });
            pdf.moveDown(0.3);
            pdf.fontSize(15).text(title, { align: "center" });
            pdf.moveDown();
            pdf.font("Helvetica").fontSize(10).fillColor("#222222");
            pdf.text("Employee: " + safeText(employee.firstName + " " + employee.lastName));
            pdf.text("Employee Code: " + safeText(employee.employeeCode));
            pdf.text("Email: " + safeText(employee.email));
            pdf.moveDown();
            for (const section of sections) {
                pdf.font("Helvetica-Bold").fontSize(11).fillColor("#17365D").text(safeText(section.heading));
                pdf.moveDown(0.25);
                pdf.font("Helvetica").fontSize(10).fillColor("#222222");
                for (const [label, value] of section.rows) pdf.text(safeText(label) + ": " + safeText(value));
                pdf.moveDown(0.7);
            }
            pdf.moveDown();
            pdf.fontSize(8).fillColor("gray").text("This is a system-generated document. Please contact HR for corrections.", { align: "center" });
            pdf.end();
            return;
        }

        const pageWidth = pdf.page.width;
        const pageHeight = pdf.page.height;
        const left = 42;
        const right = pageWidth - 42;
        const contentWidth = right - left;
        const bottomLimit = pageHeight - 48;
        const navy = "#17365D";
        const blue = "#2563EB";
        const pale = "#EFF5FC";
        const line = "#D8E1EC";
        const ink = "#243247";
        const muted = "#64748B";
        const payPeriod = sections.find((section) => section.heading === "Pay Period");
        const periodLabel = payPeriod?.rows?.find((row) => row[0] === "Month")?.[1] || "Salary Statement";

        const drawCompactHeader = () => {
            pdf.font("Helvetica-Bold").fontSize(9).fillColor(navy).text("COMPANY NAME", left, 24);
            pdf.font("Helvetica").fontSize(8).fillColor(muted).text("MONTHLY PAYSLIP", right - 130, 25, { width: 130, align: "right" });
            pdf.moveTo(left, 40).lineTo(right, 40).strokeColor(line).lineWidth(0.7).stroke();
            pdf.y = 52;
        };
        const ensureSpace = (height) => {
            if (pdf.y + height > bottomLimit) {
                pdf.addPage();
                drawCompactHeader();
            }
        };

        // Reserved logo and company identity area for later branding configuration.
        pdf.roundedRect(left, 42, 54, 54, 7).lineWidth(1).strokeColor(blue).stroke();
        pdf.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("LOGO", left + 8, 64, { width: 38, align: "center" });
        pdf.font("Helvetica-Bold").fontSize(16).fillColor(navy).text("COMPANY NAME", left + 68, 48, { width: 275 });
        pdf.font("Helvetica").fontSize(8).fillColor(muted).text("Company address and contact details", left + 68, 70, { width: 275 });
        pdf.font("Helvetica-Bold").fontSize(19).fillColor(blue).text("PAYSLIP", right - 125, 48, { width: 125, align: "right" });
        pdf.font("Helvetica").fontSize(8).fillColor(muted).text(safeText(periodLabel), right - 155, 74, { width: 155, align: "right" });
        pdf.moveTo(left, 110).lineTo(right, 110).strokeColor(blue).lineWidth(2).stroke();
        pdf.y = 124;

        // Employee information card.
        pdf.roundedRect(left, pdf.y, contentWidth, 76, 6).fillAndStroke(pale, line);
        pdf.font("Helvetica-Bold").fontSize(9).fillColor(navy).text("EMPLOYEE INFORMATION", left + 13, pdf.y + 10);
        const employeeY = pdf.y + 29;
        const col1 = left + 13;
        const col2 = left + 205;
        const col3 = left + 390;
        pdf.font("Helvetica").fontSize(7).fillColor(muted).text("EMPLOYEE NAME", col1, employeeY);
        pdf.text("EMPLOYEE CODE", col2, employeeY);
        pdf.text("EMAIL", col3, employeeY);
        pdf.font("Helvetica-Bold").fontSize(9).fillColor(ink).text(safeText(employee.firstName + " " + employee.lastName), col1, employeeY + 12, { width: 180 });
        pdf.text(safeText(employee.employeeCode), col2, employeeY + 12, { width: 170 });
        pdf.font("Helvetica").fontSize(8).text(safeText(employee.email), col3, employeeY + 12, { width: right - col3 - 12 });
        pdf.y += 91;

        for (const section of sections) {
            const isNetPay = section.heading === "Net Pay";
            ensureSpace(34);
            const headingY = pdf.y;
            pdf.roundedRect(left, headingY, contentWidth, 23, 4).fill(isNetPay ? navy : blue);
            pdf.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text(safeText(section.heading).toUpperCase(), left + 11, headingY + 7, { width: contentWidth - 22 });
            pdf.y = headingY + 27;

            for (let index = 0; index < section.rows.length; index += 1) {
                const row = section.rows[index];
                const label = safeText(row[0]);
                const value = safeText(row[1]);
                const isNetAmount = isNetPay && label.toLowerCase() === "net payable";
                const labelWidth = Math.floor(contentWidth * 0.57);
                const valueWidth = contentWidth - labelWidth - 24;
                const labelHeight = pdf.heightOfString(label, { width: labelWidth, font: "Helvetica", fontSize: isNetAmount ? 10 : 9 });
                const valueHeight = pdf.heightOfString(value, { width: valueWidth, font: isNetAmount ? "Helvetica-Bold" : "Helvetica", fontSize: isNetAmount ? 12 : 9 });
                const rowHeight = Math.max(isNetAmount ? 34 : 25, Math.max(labelHeight, valueHeight) + 12);
                ensureSpace(rowHeight + 2);

                const rowY = pdf.y;
                if (isNetAmount) pdf.roundedRect(left, rowY, contentWidth, rowHeight, 4).fill("#E8F1FF");
                else if (index % 2 === 0) pdf.rect(left, rowY, contentWidth, rowHeight).fill("#F8FAFC");
                pdf.font(isNetAmount ? "Helvetica-Bold" : "Helvetica").fontSize(isNetAmount ? 10 : 9).fillColor(isNetAmount ? navy : ink);
                pdf.text(label, left + 11, rowY + 7, { width: labelWidth });
                pdf.font(isNetAmount ? "Helvetica-Bold" : "Helvetica").fontSize(isNetAmount ? 12 : 9).fillColor(isNetAmount ? blue : ink);
                pdf.text(value, left + 11 + labelWidth, rowY + 7, { width: valueWidth, align: "right" });
                pdf.y = rowY + rowHeight;
                pdf.moveTo(left, pdf.y).lineTo(right, pdf.y).strokeColor(line).lineWidth(0.35).stroke();
            }
            pdf.y += 12;
        }

        ensureSpace(42);
        pdf.moveTo(left, pdf.y).lineTo(right, pdf.y).strokeColor(line).lineWidth(0.8).stroke();
        pdf.y += 10;
        pdf.font("Helvetica").fontSize(7).fillColor(muted).text(
            "This is a system-generated document. Sensitive identity and banking numbers are masked for security. Please contact HR for corrections.",
            left, pdf.y, { width: contentWidth, align: "center" }
        );
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
        await writePdf(filePath, title, employee, sections, documentType);
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
    const employeeRecord = await Employee.findById(employee._id).select("+hrDetailsEncrypted dateOfBirth");
    const hrDetails = employeeRecord?.hrDetailsEncrypted
        ? decryptHrDetails(employeeRecord.hrDetailsEncrypted)
        : {};
    const payrollIdentityRows = [
        ["Bank Name", hrDetails.bankName || "-"],
        ["Account Holder", hrDetails.accountHolderName || "-"],
        ["Bank Account", masked(hrDetails.bankAccountNumber)],
        ["IFSC", hrDetails.ifscCode || "-"],
        ["PAN", masked(hrDetails.panNumber)],
        ["PF Number", masked(hrDetails.pfNumber)],
        ["UAN", masked(hrDetails.uanNumber)]
    ];
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "payslip",
        title: "Monthly Payslip - " + month + " - Professional",
        sourceKey: "payroll:" + payroll._id + ":template-v2",
        issuedBy,
        sections: [
            { heading: "Pay Period", rows: [["Month", month], ["Working Days", payroll.workingDays], ["Paid Days", payroll.paidDays]] },
            { heading: "Earnings", rows: [["Basic Salary", money(payroll.basic)], ...earnings, ["Gross Earnings", money(payroll.grossEarnings)]] },
            { heading: "Deductions", rows: [...deductions, ["Total Deductions", money(payroll.totalDeductions)]] },
            { heading: "Net Pay", rows: [["Net Payable", money(payroll.netPay)], ["Payment Status", payroll.status], ["Paid Date", payroll.paidAt ? new Date(payroll.paidAt).toLocaleDateString("en-IN") : "-"]] },
            { heading: "Employee Bank and Statutory Details", rows: payrollIdentityRows }
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
        documentType: "salary_revision_letter",
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
            { heading: "Appointment Details", rows: [["Employee Code", employee.employeeCode], ["Date of Birth", employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "-"], ["Designation", designationName], ["Department", departmentName], ["Date of Joining", joiningDate], ["Work Shift", shiftName], ["Employment Status", employee.employmentStatus || "active"]] },
            { heading: "Employment Confirmation", rows: [["Appointment", "You are appointed to the above position with effect from the date of joining recorded in HRMS."], ["Terms and Conditions", "Your employment will be governed by the company's applicable policies and terms communicated by HR."]] }
        ]
    });
};
