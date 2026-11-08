import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";
import Shift from "../models/Shift.js";

const TIME_ZONE = "Asia/Kolkata";

const DEFAULT_LATE_AFTER_MINUTES = 9 * 60 + 15;
const DEFAULT_OFFICE_END_MINUTES = 18 * 60;

const timeToMinutes = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
};

const getShiftForEmployee = async (employee) => {
    if (!employee?.shift) return null;
    return Shift.findById(employee.shift).select("startTime endTime gracePeriodMinutes");
};

const HALF_DAY_MINUTES = 4 * 60;

const getLocalParts = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    const result = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
    }

    return result;
};

const getDateKey = (date = new Date()) => {
    const parts = getLocalParts(date);

    return `${parts.year}-${parts.month}-${parts.day}`;
};

const getLocalMinutes = (date) => {
    const parts = getLocalParts(date);

    return Number(parts.hour) * 60 + Number(parts.minute);
};

const getWorkMinutes = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) {
        return 0;
    }

    return Math.max(
        0,
        Math.floor(
            (new Date(checkOut).getTime() -
                new Date(checkIn).getTime()) / 60000
        )
    );
};

const isValidDateKey = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
};

const isValidDateValue = (value) => {
    if (!value) return true;

    return !Number.isNaN(new Date(value).getTime());
};

const getAttendanceStatus = (minutes) => {
    return minutes < HALF_DAY_MINUTES ? "half-day" : "present";
};

// EMPLOYEE CHECK-IN
export const checkIn = async (req, res) => {
    try {
        const employeeId = req.user.employeeId;
        const now = new Date();
        const dateKey = getDateKey(now);

        const employee = await Employee.findById(employeeId);

        if (!employee || employee.employmentStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Active employee account required"
            });
        }

        const existing = await Attendance.findOne({
            employee: employeeId,
            dateKey
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Attendance already exists for today"
            });
        }

        const localMinutes = getLocalMinutes(now);

        const attendance = await Attendance.create({
            employee: employeeId,
            dateKey,
            checkIn: now,
            status: "present",
            isLate: adjustedCheckInMinutes > lateThreshold,
            source: "self"
        });

        return res.status(201).json({
            success: true,
            message: "Check-in recorded successfully",
            data: attendance
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Today's attendance has already been recorded"
            });
        }

        console.error("Attendance check-in error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to record check-in"
        });
    }
};

// EMPLOYEE CHECK-OUT
export const checkOut = async (req, res) => {
    try {
        const employeeId = req.user.employeeId;
        const dateKey = getDateKey();

        const attendance = await Attendance.findOne({
            employee: employeeId,
            dateKey
        });

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: "Please check-in before checking out"
            });
        }

        if (!attendance.checkIn) {
            return res.status(400).json({
                success: false,
                message: "Check-in time is missing"
            });
        }

        if (attendance.checkOut) {
            return res.status(409).json({
                success: false,
                message: "You have already checked out today"
            });
        }

        const now = new Date();

        if (now <= attendance.checkIn) {
            return res.status(400).json({
                success: false,
                message: "Invalid check-out time"
            });
        }

        const workMinutes = getWorkMinutes(
            attendance.checkIn,
            now
        );

        attendance.checkOut = now;
        attendance.workMinutes = workMinutes;
        attendance.status = getAttendanceStatus(workMinutes);
        attendance.isEarlyLeaving =
            getLocalMinutes(now) < OFFICE_END_MINUTES;

        await attendance.save();

        return res.status(200).json({
            success: true,
            message: "Check-out recorded successfully",
            data: attendance
        });

    } catch (error) {
        console.error("Attendance check-out error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to record check-out"
        });
    }
};

// TODAY'S ATTENDANCE
export const getTodayAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findOne({
            employee: req.user.employeeId,
            dateKey: getDateKey()
        }).populate(
            "employee",
            "employeeCode firstName lastName email"
        );

        return res.status(200).json({
            success: true,
            data: attendance
        });

    } catch (error) {
        console.error("Get today's attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load today's attendance"
        });
    }
};

// EMPLOYEE'S OWN ATTENDANCE HISTORY
export const getMyAttendance = async (req, res) => {
    try {
        const filter = {
            employee: req.user.employeeId
        };

        const { from, to } = req.query;

        if (from && !isValidDateKey(from)) {
            return res.status(400).json({
                success: false,
                message: "Invalid from date"
            });
        }

        if (to && !isValidDateKey(to)) {
            return res.status(400).json({
                success: false,
                message: "Invalid to date"
            });
        }

        if (from || to) {
            filter.dateKey = {};

            if (from) filter.dateKey.$gte = from;
            if (to) filter.dateKey.$lte = to;
        }

        const data = await Attendance.find(filter)
            .populate(
                "employee",
                "employeeCode firstName lastName"
            )
            .sort({ dateKey: -1 })
            .limit(100);

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        console.error("Get my attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load attendance history"
        });
    }
};

// ADMIN / HR ATTENDANCE REGISTER
export const getAttendanceRegister = async (req, res) => {
    try {
        const filter = {};

        const { date, from, to, employeeId } = req.query;

        if (req.user.role !== "admin" && req.user.role !== "hr") {
            filter.employee = req.user.employeeId;
        } else if (employeeId) {
            if (!mongoose.isValidObjectId(employeeId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid employee ID"
                });
            }

            filter.employee = employeeId;
        }

        if (date) {
            if (!isValidDateKey(date)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date"
                });
            }

            filter.dateKey = date;
        } else {
            if (
                (from && !isValidDateKey(from)) ||
                (to && !isValidDateKey(to))
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date range"
                });
            }

            if (from || to) {
                filter.dateKey = {};

                if (from) filter.dateKey.$gte = from;
                if (to) filter.dateKey.$lte = to;
            }
        }

        const data = await Attendance.find(filter)
            .populate(
                "employee",
                "employeeCode firstName lastName email department"
            )
            .sort({ dateKey: -1, createdAt: -1 })
            .limit(500);

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        console.error("Attendance register error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load attendance register"
        });
    }
};

// ADMIN / HR MANUAL ATTENDANCE CORRECTION
export const saveManualAttendance = async (req, res) => {
    try {
        const {
            employeeId,
            dateKey,
            status,
            checkIn,
            checkOut,
            notes
        } = req.body;

        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({
                success: false,
                message: "Valid employee ID is required"
            });
        }

        if (!isValidDateKey(dateKey)) {
            return res.status(400).json({
                success: false,
                message: "Valid attendance date is required"
            });
        }

        if (!["present", "half-day", "absent"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance status"
            });
        }

        if (!isValidDateValue(checkIn) || !isValidDateValue(checkOut)) {
            return res.status(400).json({
                success: false,
                message: "Invalid check-in or check-out date"
            });
        }

        const employee = await Employee.findById(employeeId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const checkInDate = checkIn ? new Date(checkIn) : null;
        const checkOutDate = checkOut ? new Date(checkOut) : null;

        if (status === "absent" && (checkInDate || checkOutDate)) {
            return res.status(400).json({
                success: false,
                message: "Absent attendance cannot have check-in or check-out times"
            });
        }

        if (checkOutDate && !checkInDate) {
            return res.status(400).json({
                success: false,
                message: "Check-in time is required when check-out is provided"
            });
        }

        if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
            return res.status(400).json({
                success: false,
                message: "Check-out must be later than check-in"
            });
        }

        const workMinutes = getWorkMinutes(
            checkInDate,
            checkOutDate
        );

        const localCheckInMinutes = checkInDate
            ? getLocalMinutes(checkInDate)
            : null;

        const localCheckOutMinutes = checkOutDate
            ? getLocalMinutes(checkOutDate)
            : null;

        const update = {
            employee: employeeId,
            dateKey,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            workMinutes,
            status,
            isLate: localCheckInMinutes !== null
                ? localCheckInMinutes > LATE_AFTER_MINUTES
                : false,
            isEarlyLeaving: localCheckOutMinutes !== null
                ? localCheckOutMinutes < OFFICE_END_MINUTES
                : false,
            notes: String(notes || "").trim(),
            source: "manual",
            modifiedBy: req.user.userId
        };

        const attendance = await Attendance.findOneAndUpdate(
            {
                employee: employeeId,
                dateKey
            },
            {
                $set: update
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        ).populate(
            "employee",
            "employeeCode firstName lastName"
        );

        return res.status(200).json({
            success: true,
            message: "Attendance saved successfully",
            data: attendance
        });

    } catch (error) {
        console.error("Manual attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save attendance"
        });
    }
};