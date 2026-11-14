import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import EmployeeDocument from "../models/EmployeeDocument.js";
import Employee from "../models/Employee.js";
import SalaryStructure from "../models/SalaryStructure.js";
import { decryptHrDetails } from "./hrDetailsCrypto.js";
import { DOCUMENT_STORAGE_DIR } from "../middleware/documentUpload.js";

const money = (value) => "INR " + new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const safeText = (value) => String(value ?? "-").replace(/[\\r\\n]+/g, " ").slice(0, 500);
const masked = (value) => value ? "*".repeat(Math.max(0, String(value).length - 4)) + String(value).slice(-4) : "-";
const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(SERVICE_DIR, "../..");
const FONT_PATH = path.join(BACKEND_DIR, "assets", "fonts", "NotoSansDevanagari[wdth,wght].ttf");
const LOGO_PATH = path.join(BACKEND_DIR, "assets", "company-logo.jpg");

const writePdf = async (filePath, title, employee, sections, documentType) => {
    await fs.mkdir(DOCUMENT_STORAGE_DIR, { recursive: true });
    await fs.access(FONT_PATH);
    let logoAvailable = false;
    try { await fs.access(LOGO_PATH); logoAvailable = true; } catch { /* Logo is optional. */ }
    await new Promise((resolve, reject) => {
        const output = createWriteStream(filePath, { flags: "wx" });
        const pdf = new PDFDocument({ size: "A4", margin: 38, bufferPages: true, info: { Title: title, Author: "HRMS" } });
        pdf.registerFont("HRMS", FONT_PATH);
        pdf.registerFont("HRMS-Bold", FONT_PATH);
        output.on("finish", resolve);
        output.on("error", reject);
        pdf.on("error", reject);
        pdf.pipe(output);

        if (documentType !== "payslip") {
            const pageWidth = pdf.page.width;
            const pageHeight = pdf.page.height;
            const left = 48;
            const right = pageWidth - 48;
            const width = right - left;
            const navy = "#142D4E";
            const blue = "#2563EB";
            const line = "#DCE4EE";
            const muted = "#64748B";
            const ink = "#1E293B";
            const companyName = "PROTOVERGE LLP";
            const employeeName = safeText([employee.firstName, employee.lastName].filter(Boolean).join(" "));
            const drawLetterHeader = () => {
                pdf.rect(0, 0, pageWidth, 92).fill(navy);
                if (logoAvailable) {
                    try { pdf.image(LOGO_PATH, left, 18, { fit: [54, 54] }); } catch { /* Keep text header if logo cannot be read. */ }
                }
                pdf.font("HRMS-Bold").fontSize(18).fillColor("#FFFFFF").text(companyName, left + (logoAvailable ? 68 : 0), 28, { width: 280 });
                pdf.font("HRMS").fontSize(8).fillColor("#DCE8F7").text("Human Resources", left + (logoAvailable ? 68 : 0), 55);
                pdf.rect(0, 88, pageWidth, 4).fill(blue);
                pdf.y = 112;
            };
            const ensureLetterSpace = (height) => {
                if (pdf.y + height > pageHeight - 66) {
                    pdf.addPage();
                    drawLetterHeader();
                }
            };
            drawLetterHeader();
            pdf.font("HRMS-Bold").fontSize(17).fillColor(navy).text(title, left, pdf.y, { width, align: "center" });
            pdf.moveDown(0.45);
            pdf.font("HRMS").fontSize(9).fillColor(muted).text("Date: " + new Date().toLocaleDateString("en-IN"), { align: "right" });
            pdf.moveDown(0.8);
            pdf.font("HRMS-Bold").fontSize(10).fillColor(ink).text("Employee Details");
            pdf.moveDown(0.35);
            const identityRows = [
                ["Employee Name", employeeName],
                ["Employee Code", safeText(employee.employeeCode)],
                ["Email Address", safeText(employee.email)],
                ["Department", safeText(employee.department?.name)],
                ["Designation", safeText(employee.designation?.name)],
                ["Date of Joining", employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "-"]
            ];
            const drawRows = (rows) => {
                for (const [label, value] of rows) {
                    const labelX = left + 10;
                    const valueX = left + 155;
                    const valueWidth = width - 170;
                    const valueHeight = pdf.heightOfString(safeText(value), { width: valueWidth, font: "HRMS", fontSize: 9, lineGap: 2 });
                    const rowHeight = Math.max(25, valueHeight + 12);
                    ensureLetterSpace(rowHeight + 2);
                    const top = pdf.y;
                    pdf.rect(left, top, width, rowHeight).fill("#F8FAFC");
                    pdf.moveTo(left, top + rowHeight).lineTo(right, top + rowHeight).strokeColor(line).lineWidth(0.5).stroke();
                    pdf.font("HRMS-Bold").fontSize(8.5).fillColor(muted).text(safeText(label), labelX, top + 8, { width: 135 });
                    pdf.font("HRMS").fontSize(9).fillColor(ink).text(safeText(value), valueX, top + 7, { width: valueWidth, lineGap: 2 });
                    pdf.y = top + rowHeight + 1;
                }
            };
            drawRows(identityRows);
            pdf.moveDown(0.8);
            for (const section of sections) {
                ensureLetterSpace(42);
                pdf.font("HRMS-Bold").fontSize(11).fillColor(navy).text(safeText(section.heading), left, pdf.y, { width });
                pdf.moveDown(0.35);
                drawRows(section.rows || []);
                pdf.moveDown(0.6);
            }
            ensureLetterSpace(110);
            pdf.moveDown(1.2);
            pdf.font("HRMS").fontSize(9).fillColor(ink).text("For " + companyName, left, pdf.y, { width: width / 2 });
            pdf.moveDown(3);
            pdf.font("HRMS-Bold").fontSize(9).text("Authorized Signatory", left, pdf.y, { width: width / 2 });
            pdf.font("HRMS").fontSize(8).fillColor(muted).text("Employee Acknowledgement", right - 170, pdf.y - 13, { width: 170, align: "right" });
            const pageRange = pdf.bufferedPageRange();
            for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
                pdf.switchToPage(page);
                pdf.font("HRMS").fontSize(7).fillColor(muted)
                    .text("CONFIDENTIAL  |  " + companyName, left, pageHeight - 30, { width: width / 2, lineBreak: false });
                pdf.text("Page " + (page + 1) + " of " + pageRange.count, right - 90, pageHeight - 30, { width: 90, align: "right", lineBreak: false });
            }
            pdf.end();
            return;
        }

        const pageWidth = pdf.page.width;
        const pageHeight = pdf.page.height;
        const left = 38;
        const right = pageWidth - 38;
        const width = right - left;
        const bottom = pageHeight - 48;
        const colors = {
            navy: "#142D4E",
            blue: "#2563EB",
            teal: "#0F766E",
            ink: "#1E293B",
            muted: "#64748B",
            line: "#DCE4EE",
            pale: "#F1F5F9",
            white: "#FFFFFF",
            greenPale: "#E8F5EF",
            green: "#166534"
        };
        const getSection = (heading) => sections.find((section) => section.heading === heading);
        const rows = (heading) => getSection(heading)?.rows || [];
        const valueOf = (heading, label) => rows(heading).find((row) => row[0] === label)?.[1] ?? "-";
        const period = safeText(valueOf("Pay Period", "Month"));
        const employeeName = safeText([employee.firstName, employee.lastName].filter(Boolean).join(" "));
        let y = 0;

        const ensureSpace = (height) => {
            if (y + height > bottom) {
                pdf.addPage();
                drawPageHeader(true);
            }
        };
        const drawPageHeader = (compact = false) => {
            if (compact) {
                pdf.rect(0, 0, pageWidth, 48).fill(colors.navy);
                pdf.font("HRMS-Bold").fontSize(9).fillColor(colors.white).text("PROTOVERGE LLP", left, 17);
                pdf.font("HRMS").fontSize(8).fillColor("#DCE8F7").text("PAYSLIP  |  " + period, right - 180, 18, { width: 180, align: "right" });
                y = 62;
                return;
            }
            pdf.rect(0, 0, pageWidth, 116).fill(colors.navy);
            pdf.rect(0, 110, pageWidth, 6).fill(colors.blue);
            if (logoAvailable) {
                try { pdf.image(LOGO_PATH, left, 27, { fit: [55, 55] }); } catch { /* Continue with company name. */ }
            }
            pdf.font("HRMS-Bold").fontSize(17).fillColor(colors.white).text("PROTOVERGE LLP", left + (logoAvailable ? 70 : 0), 30, { width: 285 });
            pdf.font("HRMS").fontSize(8).fillColor("#DCE8F7").text("Human Resources", left + (logoAvailable ? 70 : 0), 55, { width: 300 });
            pdf.font("HRMS-Bold").fontSize(21).fillColor(colors.white).text("PAYSLIP", right - 145, 31, { width: 145, align: "right" });
            pdf.font("HRMS").fontSize(9).fillColor("#DCE8F7").text(period, right - 145, 61, { width: 145, align: "right" });
            y = 132;
        };

        const drawSectionTitle = (label, x, top, w, accent = colors.blue) => {
            pdf.roundedRect(x, top, w, 22, 4).fill(accent);
            pdf.font("HRMS-Bold").fontSize(8).fillColor(colors.white).text(label.toUpperCase(), x + 10, top + 7, { width: w - 20 });
        };

        const drawTable = (label, tableRows, x, top, w, accent) => {
            drawSectionTitle(label, x, top, w, accent);
            let cursor = top + 22;
            const labelW = w * 0.67;
            tableRows.forEach(([name, amount], index) => {
                const isTotal = /^(gross earnings|total deductions)$/i.test(String(name));
                const rowH = 24;
                if (cursor + rowH > bottom) {
                    pdf.addPage();
                    drawPageHeader(true);
                    cursor = y;
                }
                if (isTotal) pdf.rect(x, cursor, w, rowH).fill("#EAF0F7");
                else if (index % 2 === 0) pdf.rect(x, cursor, w, rowH).fill("#F8FAFC");
                pdf.font(isTotal ? "HRMS-Bold" : "HRMS").fontSize(8.5).fillColor(colors.ink).text(safeText(name), x + 8, cursor + 7, { width: labelW - 12 });
                pdf.font(isTotal ? "HRMS-Bold" : "HRMS").fontSize(8.5).fillColor(colors.ink).text(safeText(amount), x + labelW, cursor + 7, { width: w - labelW - 8, align: "right" });
                pdf.moveTo(x, cursor + rowH).lineTo(x + w, cursor + rowH).strokeColor(colors.line).lineWidth(0.4).stroke();
                cursor += rowH;
            });
            return cursor;
        };

        drawPageHeader(false);

        // Employee details panel
        pdf.roundedRect(left, y, width, 82, 7).fillAndStroke("#F5F8FC", colors.line);
        pdf.font("HRMS-Bold").fontSize(8).fillColor(colors.navy).text("EMPLOYEE DETAILS", left + 13, y + 10);
        const info = [
            ["EMPLOYEE NAME", employeeName],
            ["EMPLOYEE CODE", safeText(employee.employeeCode)],
            ["EMAIL ADDRESS", safeText(employee.email)],
            ["PAY PERIOD", period],
            ["WORKING DAYS", safeText(valueOf("Pay Period", "Working Days"))],
            ["PAID DAYS", safeText(valueOf("Pay Period", "Paid Days"))]
        ];
        const infoColW = (width - 26) / 3;
        info.forEach(([label, value], index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = left + 13 + col * infoColW;
            const top = y + 29 + row * 25;
            pdf.font("HRMS").fontSize(6.5).fillColor(colors.muted).text(label, x, top, { width: infoColW - 8 });
            pdf.font("HRMS-Bold").fontSize(8).fillColor(colors.ink).text(value, x, top + 9, { width: infoColW - 8, ellipsis: true });
        });
        y += 96;

        // Three high-visibility payroll summary cards
        const summaryGap = 10;
        const cardW = (width - summaryGap * 2) / 3;
        const summaries = [
            ["GROSS EARNINGS", valueOf("Earnings", "Gross Earnings"), colors.navy, "#EFF4FA"],
            ["TOTAL DEDUCTIONS", valueOf("Deductions", "Total Deductions"), colors.teal, "#EAF6F4"],
            ["NET PAYABLE", valueOf("Net Pay", "Net Payable"), colors.green, colors.greenPale]
        ];
        summaries.forEach(([label, value, accent, fill], index) => {
            const x = left + index * (cardW + summaryGap);
            pdf.roundedRect(x, y, cardW, 62, 7).fill(fill);
            pdf.rect(x, y, 4, 62).fill(accent);
            pdf.font("HRMS-Bold").fontSize(7).fillColor(colors.muted).text(label, x + 12, y + 12, { width: cardW - 22 });
            pdf.font("HRMS-Bold").fontSize(index === 2 ? 14 : 12).fillColor(accent).text(safeText(value), x + 12, y + 31, { width: cardW - 22 });
        });
        y += 77;

        // Side-by-side earnings and deductions statements
        const tableGap = 14;
        const tableW = (width - tableGap) / 2;
        const earningsRows = rows("Earnings");
        const deductionRows = rows("Deductions");
        const leftEnd = drawTable("Earnings", earningsRows, left, y, tableW, colors.blue);
        const rightEnd = drawTable("Deductions", deductionRows, left + tableW + tableGap, y, tableW, colors.teal);
        y = Math.max(leftEnd, rightEnd) + 17;

        // Net pay emphasis panel
        ensureSpace(72);
        pdf.roundedRect(left, y, width, 62, 7).fill(colors.navy);
        pdf.font("HRMS-Bold").fontSize(8).fillColor("#DCE8F7").text("FINAL NET PAY", left + 15, y + 12);
        pdf.font("HRMS-Bold").fontSize(19).fillColor(colors.white).text(safeText(valueOf("Net Pay", "Net Payable")), left + 15, y + 28, { width: width * 0.55 });
        pdf.font("HRMS-Bold").fontSize(8).fillColor("#DCE8F7").text("PAYMENT STATUS", right - 135, y + 13, { width: 120, align: "right" });
        pdf.font("HRMS-Bold").fontSize(10).fillColor(colors.white).text(safeText(valueOf("Net Pay", "Payment Status")).toUpperCase(), right - 135, y + 30, { width: 120, align: "right" });
        y += 77;

        // Bank and statutory information in a compact two-column table
        const statutory = rows("Employee Bank and Statutory Details");
        if (statutory.length) {
            ensureSpace(35 + Math.ceil(statutory.length / 2) * 31);
            drawSectionTitle("Bank & Statutory Details", left, y, width, colors.navy);
            y += 22;
            const statColW = (width - 20) / 2;
            statutory.forEach(([label, value], index) => {
                const col = index % 2;
                const row = Math.floor(index / 2);
                const x = left + 10 + col * statColW;
                const top = y + row * 31;
                if (index % 2 === 0) pdf.rect(left, top, width, 31).fill("#F8FAFC");
                pdf.font("HRMS").fontSize(7).fillColor(colors.muted).text(safeText(label).toUpperCase(), x, top + 5, { width: statColW - 12 });
                pdf.font("HRMS-Bold").fontSize(8).fillColor(colors.ink).text(safeText(value), x, top + 16, { width: statColW - 12 });
            });
            y += Math.ceil(statutory.length / 2) * 31 + 14;
        }

        ensureSpace(30);
        pdf.moveTo(left, y).lineTo(right, y).strokeColor(colors.line).lineWidth(0.8).stroke();
        pdf.font("HRMS").fontSize(7).fillColor(colors.muted).text(
            "This is a system-generated payslip. Banking and identity numbers are masked for security. Contact HR for corrections.",
            left, y + 9, { width, align: "center" }
        );

        const pageRange = pdf.bufferedPageRange();
        for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
            pdf.switchToPage(page);
            pdf.font("HRMS").fontSize(7).fillColor(colors.muted)
                .text("CONFIDENTIAL  |  HRMS", left, pageHeight - 27, { width: width / 2, lineBreak: false });
            pdf.text("Page " + (page + 1) + " of " + pageRange.count, right - 100, pageHeight - 27, { width: 100, align: "right", lineBreak: false });
        }
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
        title: "Monthly Payslip - " + month + " - PROTOVERGE LLP",
        sourceKey: "payroll:" + payroll._id + ":template-v4",
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

const getEmployeeSalaryRows = async (employeeId) => {
    const salary = await SalaryStructure.findOne({ employee: employeeId, isActive: true }).lean();
    if (!salary) return [["Compensation", "Salary structure not yet configured in HRMS"]];
    const monthlyEarnings = Number(salary.monthlyBasic || 0) +
        (salary.earnings || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const monthlyDeductions = (salary.deductions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return [
        ["Monthly Basic", money(salary.monthlyBasic)],
        ...(salary.earnings || []).map((item) => [item.name, money(item.amount)]),
        ["Gross Monthly Earnings", money(monthlyEarnings)],
        ...(salary.deductions || []).map((item) => ["Deduction - " + item.name, money(item.amount)]),
        ["Net Monthly Estimate", money(monthlyEarnings - monthlyDeductions)],
        ["Annual Gross Compensation", money(monthlyEarnings * 12)],
        ["Effective From", new Date(salary.effectiveFrom).toLocaleDateString("en-IN", { timeZone: "UTC" })]
    ];
};

const getEmployeeLetterDetails = (employee) => {
    const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "-";
    return [
        ["Employee Code", employee.employeeCode],
        ["Employee Name", [employee.firstName, employee.lastName].filter(Boolean).join(" ")],
        ["Email Address", employee.email],
        ["Phone Number", employee.phone || "-"],
        ["Department", employee.department?.name || "-"],
        ["Designation", employee.designation?.name || "-"],
        ["Reporting Manager", employee.reportingManager
            ? [employee.reportingManager.firstName, employee.reportingManager.lastName].filter(Boolean).join(" ") + " (" + employee.reportingManager.employeeCode + ")"
            : "As assigned by HR"],
        ["Date of Joining", date(employee.joiningDate)]
    ];
};

export const generateAppointmentLetterDocument = async (employee, issuedBy = null) => {
    if (!employee?._id) throw new Error("Employee details are required");
    const salaryRows = await getEmployeeSalaryRows(employee._id);
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "appointment_letter",
        title: "Appointment Letter",
        sourceKey: "appointment:" + employee._id + ":template-v2",
        issuedBy,
        sections: [
            { heading: "Appointment Details", rows: getEmployeeLetterDetails(employee) },
            { heading: "Compensation Annexure", rows: salaryRows },
            { heading: "Employment Terms", rows: [
                ["Appointment", "Your appointment is effective from the date of joining stated in this letter."],
                ["Work Location and Schedule", "Your assigned work location and working schedule will be communicated by the company."],
                ["Company Policies", "Your employment is governed by the applicable policies and procedures of PROTOVERGE LLP, as communicated by HR."]
            ] }
        ]
    });
};

export const generateOfferLetterDocument = async (employee, issuedBy = null) => {
    if (!employee?._id) throw new Error("Employee details are required");
    const salaryRows = await getEmployeeSalaryRows(employee._id);
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "offer_letter",
        title: "Offer of Employment",
        sourceKey: "offer:" + employee._id + ":template-v1",
        issuedBy,
        sections: [
            { heading: "Offer Details", rows: getEmployeeLetterDetails(employee) },
            { heading: "Compensation Annexure", rows: salaryRows },
            { heading: "Offer and Acceptance", rows: [
                ["Offer", "PROTOVERGE LLP is pleased to offer employment for the designation and department stated above."],
                ["Joining Date", employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "To be confirmed by HR"],
                ["Acceptance", "Please sign the acknowledgement section to confirm that you have reviewed this offer. Any additional employment terms will be provided by HR in writing."]
            ] }
        ]
    });
};

export const generateConfirmationLetterDocument = async (employee, issuedBy = null) => {
    if (!employee?._id) throw new Error("Employee details are required");
    const salaryRows = await getEmployeeSalaryRows(employee._id);
    return createGeneratedEmployeeDocument({
        employee,
        documentType: "confirmation_letter",
        title: "Employment Confirmation Letter",
        sourceKey: "confirmation:" + employee._id + ":template-v1",
        issuedBy,
        sections: [
            { heading: "Employment Details", rows: getEmployeeLetterDetails(employee) },
            { heading: "Compensation Annexure", rows: salaryRows },
            { heading: "Confirmation", rows: [
                ["Confirmation", "This letter confirms your employment with PROTOVERGE LLP in the designation and department stated above."],
                ["Effective Date", employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "To be confirmed by HR"],
                ["Terms", "Your employment will continue in accordance with the applicable company policies and employment terms communicated by HR."]
            ] }
        ]
    });
};
