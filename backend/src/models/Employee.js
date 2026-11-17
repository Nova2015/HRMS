import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
    {
        employeeCode: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        phone: { type: String, trim: true, default: "" },
        profilePhoto: { type: String, default: "", select: false },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
        designation: { type: mongoose.Schema.Types.ObjectId, ref: "Designation", required: true },
        shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", default: null },
        leaveRequestVersion: { type: Number, default: 0, select: false },
        reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null, index: true },
        hierarchyVersion: { type: Number, default: 0, select: false },
        joiningDate: { type: Date, required: true },
        dateOfBirth: { type: Date, default: null },
        hrDetailsEncrypted: { type: String, default: "", select: false },
        employmentStatus: {
            type: String,
            enum: ["active", "inactive", "resigned", "terminated"],
            default: "active"
        },
        isTestRecord: { type: Boolean, default: false, select: false },
        isArchived: { type: Boolean, default: false, index: true },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    { timestamps: true }
);

const Employee = mongoose.model("Employee", employeeSchema);
export default Employee;
