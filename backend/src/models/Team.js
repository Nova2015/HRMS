import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
        description: { type: String, default: "", trim: true, maxlength: 500 },
        isActive: { type: Boolean, default: true, index: true },
        assignmentVersion: { type: Number, default: 0, select: false }
    },
    { timestamps: true }
);

teamSchema.index({ department: 1, name: 1 }, { unique: true });
teamSchema.index({ department: 1, code: 1 }, { unique: true });

const Team = mongoose.model("Team", teamSchema);
export default Team;
