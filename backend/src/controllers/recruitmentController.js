import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Candidate from "../models/Candidate.js";
import JobOpening from "../models/JobOpening.js";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";

const candidateStatuses = new Set(["applied", "screening", "interview", "selected", "rejected"]);
const jobStatuses = new Set(["open", "on_hold", "closed"]);

export const isValidJoiningDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
 
export const isValidResumeUrl = (value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim();
    if (!normalized) return true;
    try {
        const url = new URL(normalized);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

export const hasValidCandidateFieldLengths = ({ firstName, lastName, email, phone, currentCompany = "", resumeUrl = "", notes = "" }) => (
    String(firstName ?? "").trim().length <= 80 &&
    String(lastName ?? "").trim().length <= 80 &&
    String(email ?? "").trim().length <= 254 &&
    String(phone ?? "").trim().length <= 25 &&
    String(currentCompany ?? "").trim().length <= 120 &&
    String(resumeUrl ?? "").trim().length <= 500 &&
    String(notes ?? "").trim().length <= 2000
);

const populatedCandidate = (query) => query
    .populate("jobOpening", "title status")
    .populate("department", "name code")
    .populate("designation", "name")
    .populate("employee", "employeeCode firstName lastName");

export const getRecruitmentWorkspace = async (req, res) => {
    try {
        const [jobs, candidates, departments, designations] = await Promise.all([
            JobOpening.find().populate("department", "name").populate("designation", "name").sort({ createdAt: -1 }).limit(300),
            populatedCandidate(Candidate.find().sort({ createdAt: -1 }).limit(500)),
            Department.find().select("name code description isActive").sort({ name: 1 }),
            Designation.find().select("name department description isActive").sort({ name: 1 })
        ]);
        const summary = {
            openJobs: jobs.filter((job) => job.status === "open").length,
            totalCandidates: candidates.length,
            inPipeline: candidates.filter((candidate) => ["applied", "screening", "interview"].includes(candidate.status)).length,
            selected: candidates.filter((candidate) => candidate.status === "selected").length,
            hired: candidates.filter((candidate) => candidate.status === "hired").length
        };
        return res.json({ success: true, data: { jobs, candidates, departments, designations, summary } });
    } catch (error) {
        console.error("Recruitment workspace:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load Recruitment workspace" });
    }
};

export const createJobOpening = async (req, res) => {
    try {
        const { title, department, designation, description, employmentType = "full_time", location = "", openings = 1 } = req.body || {};
        if (!String(title || "").trim() || !String(description || "").trim() ||
            !mongoose.isValidObjectId(department) || !mongoose.isValidObjectId(designation) ||
            !Number.isInteger(Number(openings)) || Number(openings) < 1 ||
            !["full_time", "part_time", "contract", "internship"].includes(employmentType)) {
            return res.status(400).json({ success: false, message: "Provide a valid job title, department, designation, description, employment type and number of openings" });
        }
        const [departmentDoc, designationDoc] = await Promise.all([
            Department.findOne({ _id: department, isActive: true }),
            Designation.findOne({ _id: designation, department, isActive: true })
        ]);
        if (!departmentDoc || !designationDoc) {
            return res.status(400).json({ success: false, message: "Select an active designation belonging to the selected department" });
        }
        const job = await JobOpening.create({
            title: String(title).trim(), department, designation,
            description: String(description).trim(), employmentType,
            location: String(location).trim(), openings: Number(openings),
            createdBy: req.user.userId
        });
        const data = await JobOpening.findById(job._id).populate("department", "name").populate("designation", "name");
        return res.status(201).json({ success: true, message: "Job opening created successfully", data });
    } catch (error) {
        console.error("Create job opening:", error.message);
        return res.status(500).json({ success: false, message: "Unable to create job opening" });
    }
};

export const updateJobOpeningStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!mongoose.isValidObjectId(id) || !jobStatuses.has(status)) {
            return res.status(400).json({ success: false, message: "Provide a valid job opening and status" });
        }
        const job = await JobOpening.findByIdAndUpdate(id, { $set: { status } }, { new: true, runValidators: true })
            .populate("department", "name").populate("designation", "name");
        if (!job) return res.status(404).json({ success: false, message: "Job opening not found" });
        return res.json({ success: true, message: "Job opening status updated", data: job });
    } catch (error) {
        console.error("Update job opening:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update job opening" });
    }
};

export const createCandidate = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, jobOpening, experienceYears = 0, currentCompany = "", resumeUrl = "", notes = "" } = req.body || {};
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!String(firstName || "").trim() || !String(lastName || "").trim() ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
            !String(phone || "").trim() || !mongoose.isValidObjectId(jobOpening) ||
            !isValidResumeUrl(resumeUrl) ||
            !hasValidCandidateFieldLengths({ firstName, lastName, email: cleanEmail, phone, currentCompany, resumeUrl, notes }) ||
            !Number.isFinite(Number(experienceYears)) || Number(experienceYears) < 0 || Number(experienceYears) > 60) {
            return res.status(400).json({ success: false, message: "Provide valid candidate name, email, phone, job opening and experience" });
        }
        const job = await JobOpening.findOne({ _id: jobOpening, status: "open" });
        if (!job) return res.status(400).json({ success: false, message: "Select an open job position" });
        const candidate = await Candidate.create({
            firstName: String(firstName).trim(), lastName: String(lastName).trim(),
            email: cleanEmail, phone: String(phone).trim(),
            jobOpening: job._id, department: job.department, designation: job.designation,
            experienceYears: Number(experienceYears),
            currentCompany: String(currentCompany).trim(),
            resumeUrl: String(resumeUrl).trim(), notes: String(notes).trim(),
            createdBy: req.user.userId
        });
        const data = await populatedCandidate(Candidate.findById(candidate._id));
        return res.status(201).json({ success: true, message: "Candidate added successfully", data });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ success: false, message: "This candidate is already registered for the selected job" });
        console.error("Create candidate:", error.message);
        return res.status(500).json({ success: false, message: "Unable to add candidate" });
    }
};

export const updateCandidateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        if (!mongoose.isValidObjectId(id) || !candidateStatuses.has(status)) {
            return res.status(400).json({ success: false, message: "Provide a valid candidate and pipeline status" });
        }
        const candidate = await Candidate.findOneAndUpdate(
            { _id: id, status: { $ne: "hired" }, employee: null },
            { $set: { status } },
            { new: true, runValidators: true }
        );
        if (!candidate) {
            const existing = await Candidate.findById(id).select("_id");
            if (!existing) return res.status(404).json({ success: false, message: "Candidate not found" });
            return res.status(409).json({ success: false, message: "Candidate has already been hired or converted; pipeline status cannot be changed" });
        }
        const data = await populatedCandidate(Candidate.findById(candidate._id));
        return res.json({ success: true, message: "Candidate status updated", data });
    } catch (error) {
        console.error("Update candidate status:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update candidate status" });
    }
};

export const reserveJobOpeningForHire = async (candidate, session) => {
    // Write to the job document inside the transaction to serialize concurrent hires
    // for the same opening before checking the number of already-hired candidates.
    const job = await JobOpening.findOneAndUpdate(
        { _id: candidate.jobOpening },
        { $inc: { hiringVersion: 1 } },
        { new: true, session }
    );
    if (!job) {
        const conflict = new Error("The job opening for this candidate no longer exists");
        conflict.code = 409;
        throw conflict;
    }

    const hiredCount = await Candidate.countDocuments({
        jobOpening: candidate.jobOpening,
        status: "hired"
    }).session(session);

    if (hiredCount >= job.openings) {
        const conflict = new Error("All openings for this job have been filled");
        conflict.code = 409;
        throw conflict;
    }
};

export const hireCandidate = async (req, res) => {
    try {
        const { id } = req.params;
        const { employeeCode, joiningDate, initialPassword } = req.body || {};
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid candidate ID" });
        if (!String(employeeCode || "").trim() || !isValidJoiningDate(joiningDate) || !initialPassword ||
            String(initialPassword).length < 12 || Buffer.byteLength(String(initialPassword), "utf8") > 72) {
            return res.status(400).json({ success: false, message: "Enter employee code, joining date and an initial password of at least 12 characters (maximum 72 UTF-8 bytes)" });
        }

        const normalizedCode = String(employeeCode).trim().toUpperCase();
        const passwordHash = await bcrypt.hash(String(initialPassword), 12);
        const session = await mongoose.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                const candidate = await Candidate.findOne({
                    _id: id,
                    status: "selected",
                    employee: null
                }).session(session);
                if (!candidate) {
                    const conflict = new Error("Only a selected candidate who has not been hired can be converted to an employee");
                    conflict.code = 409;
                    throw conflict;
                }

                await reserveJobOpeningForHire(candidate, session);

                const [duplicateCode, duplicateEmail, department, designation] = await Promise.all([
                    Employee.exists({ employeeCode: normalizedCode }).session(session),
                    User.exists({ email: candidate.email }).session(session),
                    Department.findOne({ _id: candidate.department, isActive: true }).session(session),
                    Designation.findOne({ _id: candidate.designation, department: candidate.department, isActive: true }).session(session)
                ]);
                if (duplicateCode || duplicateEmail) {
                    const conflict = new Error(duplicateCode ? "Employee code already exists" : "Candidate email is already linked to a login account");
                    conflict.code = 409;
                    throw conflict;
                }
                if (!department || !designation) {
                    const conflict = new Error("Candidate department or designation is no longer active; update the job before hiring");
                    conflict.code = 409;
                    throw conflict;
                }

                const employee = new Employee({
                    employeeCode: normalizedCode,
                    firstName: candidate.firstName,
                    lastName: candidate.lastName,
                    email: candidate.email,
                    phone: candidate.phone,
                    department: candidate.department,
                    designation: candidate.designation,
                    joiningDate,
                    employmentStatus: "active"
                });
                await employee.save({ session });

                const user = new User({
                    employee: employee._id,
                    email: candidate.email,
                    passwordHash,
                    role: "employee",
                    isActive: true
                });
                await user.save({ session });

                const hiredCandidate = await Candidate.findOneAndUpdate(
                    { _id: candidate._id, status: "selected", employee: null },
                    { $set: { status: "hired", employee: employee._id, hiredAt: new Date() } },
                    { new: true, runValidators: true, session }
                );
                if (!hiredCandidate) {
                    const conflict = new Error("Candidate hiring status changed; refresh and try again");
                    conflict.code = 409;
                    throw conflict;
                }
                result = {
                    candidateId: hiredCandidate._id,
                    employee: {
                        _id: employee._id, employeeCode: employee.employeeCode,
                        firstName: employee.firstName, lastName: employee.lastName,
                        email: employee.email, department: department.name,
                        designation: designation.name, joiningDate: employee.joiningDate
                    }
                };
            });
        } finally {
            await session.endSession();
        }

        return res.status(201).json({
            success: true,
            message: "Candidate converted to an employee successfully",
            data: result
        });
    } catch (error) {
        console.error("Hire candidate:", error.message);
        const transactionUnavailable = error.hasErrorLabel?.("TransientTransactionError") ||
            error.hasErrorLabel?.("UnknownTransactionCommitResult") ||
            /transaction numbers are only allowed|replica set|mongos/i.test(error.message || "");
        const statusCode = error.code === 11000 ? 409
            : [400, 409].includes(error.code) ? error.code
            : transactionUnavailable ? 503 : 500;
        return res.status(statusCode).json({
            success: false,
            message: statusCode === 409 ? error.message || "Employee code or email already exists"
                : statusCode === 400 ? error.message
                : statusCode === 503 ? "Hiring is temporarily unavailable; please retry"
                : "Unable to convert candidate to employee"
        });
    }
};
