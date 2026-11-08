import mongoose from "mongoose";

const designationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: true
        },
        description: {
            type: String,
            default: ""
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

designationSchema.index(
    { name: 1, department: 1 },
    { unique: true }
);

const Designation = mongoose.model("Designation", designationSchema);

export default Designation;