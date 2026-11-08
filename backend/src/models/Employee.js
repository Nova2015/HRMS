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
        firstName: {
            type: String,
            required: true,
            trim: true
        },
        lastName: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            trim: true,
            default: ""
        },
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: true
        },
        designation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Designation",
            required: true
        },
        shift: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Shift",
            default: null
        },
        joiningDate: {
            type: Date,
            required: true
        },
        employmentStatus: {
            type: String,
            enum: ["active", "inactive", "resigned", "terminated"],
            default: "active"
        }
    },
    { timestamps: true }
);

const Employee = mongoose.model("Employee", employeeSchema);

export default Employee;