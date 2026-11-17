const TIME_ZONE = "Asia/Kolkata";

const getLocalParts = (date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
};

const timeToMinutes = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
};

export const getAttendanceDateKey = (date, shift) => {
    const parts = getLocalParts(date);
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (!shift) return dateKey;

    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    if (end > start || localMinutes >= end) return dateKey;

    const previous = new Date(`${dateKey}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    return previous.toISOString().slice(0, 10);
};

export const getShiftSnapshot = (shift) => shift ? {
    shiftStartTime: shift.startTime,
    shiftEndTime: shift.endTime,
    shiftGracePeriodMinutes: shift.gracePeriodMinutes
} : {
    shiftStartTime: null,
    shiftEndTime: null,
    shiftGracePeriodMinutes: null
};

export const getShiftFromSnapshot = (attendance, fallbackShift = null) => {
    if (attendance?.shiftStartTime && attendance?.shiftEndTime) {
        return {
            startTime: attendance.shiftStartTime,
            endTime: attendance.shiftEndTime,
            gracePeriodMinutes: attendance.shiftGracePeriodMinutes ?? 0
        };
    }
    return fallbackShift;
};

export const isLateCheckIn = (date, shift, defaultLateAfterMinutes) => {
    const parts = getLocalParts(date);
    const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    if (!shift) return localMinutes > defaultLateAfterMinutes;

    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    const overnight = end <= start;
    const afterMidnightShiftWindow = overnight && localMinutes < end;
    if (afterMidnightShiftWindow) return false;

    return localMinutes > start + shift.gracePeriodMinutes;
};
