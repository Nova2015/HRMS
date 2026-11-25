import mongoose from "mongoose";

export const WORK_ASSIGNMENT_STATUSES = [
    "assigned",
    "accepted",
    "in_progress",
    "on_hold",
    "pending",
    "submitted_for_review",
    "rework_required",
    "completed"
];

export const WORK_ASSIGNMENT_PRIORITIES = ["low", "medium", "high", "urgent"];

const historySchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
            enum: [
                "created",
                "delegated",
                "accepted",
                "started",
                "paused",
                "resumed",
                "submitted",
                "review_approved",
                "rework_requested",
                "commented"
            ]
        },
        actorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        actorEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
        fromStatus: { type: String, enum: WORK_ASSIGNMENT_STATUSES, default: null },
        toStatus: { type: String, enum: WORK_ASSIGNMENT_STATUSES, default: null },
        note: { type: String, default: "", trim: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const workAssignmentSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 180 },
        description: { type: String, default: "", trim: true, maxlength: 10000 },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
        team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },

        parentAssignment: { type: mongoose.Schema.Types.ObjectId, ref: "WorkAssignment", default: null, index: true },
        rootAssignment: { type: mongoose.Schema.Types.ObjectId, ref: "WorkAssignment", default: null, index: true },
        delegationDepth: { type: Number, default: 0, min: 0, max: 20 },

        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },

        priority: { type: String, enum: WORK_ASSIGNMENT_PRIORITIES, default: "medium", index: true },
        status: { type: String, enum: WORK_ASSIGNMENT_STATUSES, default: "assigned", index: true },
        givenDays: { type: Number, required: true, min: 1, max: 3650 },
        assignedAt: { type: Date, default: Date.now, required: true },
        dueDate: { type: Date, required: true, index: true },
        acceptedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        completionRemarks: { type: String, default: "", trim: true, maxlength: 4000 },
        history: { type: [historySchema], default: [] },
        version: { type: Number, default: 0, min: 0 }
    },
    { timestamps: true }
);

workAssignmentSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
workAssignmentSchema.index({ reviewer: 1, status: 1, updatedAt: -1 });
workAssignmentSchema.index({ department: 1, team: 1, createdAt: -1 });
workAssignmentSchema.index({ rootAssignment: 1, createdAt: 1 });

const WorkAssignment = mongoose.model("WorkAssignment", workAssignmentSchema);
export default WorkAssignment;
