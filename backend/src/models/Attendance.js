import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },

        dateKey: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/
        },

        checkIn: {
            type: Date,
            default: null
        },

        checkOut: {
            type: Date,
            default: null
        },

        workMinutes: {
            type: Number,
            default: 0,
            min: 0
        },

        status: {
            type: String,
            enum: ["present", "half-day", "absent"],
            default: "present"
        },

        isLate: {
            type: Boolean,
            default: false
        },

        isEarlyLeaving: {
            type: Boolean,
            default: false
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },

        source: {
            type: String,
            enum: ["self", "manual"],
            default: "self"
        },

        modifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    {
        timestamps: true
    }
);

// One employee can have only one attendance record per date.
attendanceSchema.index(
    { employee: 1, dateKey: 1 },
    { unique: true }
);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;