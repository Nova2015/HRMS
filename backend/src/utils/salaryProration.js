export const calculateAutomaticProration = (workingDays, paidDays, calendarDays, segmentCalendarDays) => {
    if (!Number.isFinite(workingDays) || workingDays <= 0 ||
        !Number.isFinite(paidDays) || paidDays < 0 || paidDays > workingDays ||
        !Number.isFinite(calendarDays) || calendarDays <= 0 ||
        !Array.isArray(segmentCalendarDays) || !segmentCalendarDays.length ||
        segmentCalendarDays.some((days) => !Number.isFinite(days) || days <= 0)) {
        throw new Error("Invalid automatic proration inputs");
    }
    const splitWorkingDays = segmentCalendarDays.map((days) => workingDays * days / calendarDays);
    const splitPaidDays = splitWorkingDays.map((days) => paidDays * days / workingDays);
    return { workingDays: splitWorkingDays, paidDays: splitPaidDays };
};

export const calculateManualProration = (workingDays, paidDays, oldWorkingDays, newWorkingDays, oldPaidDays, newPaidDays) => {
    const values = [workingDays, paidDays, oldWorkingDays, newWorkingDays, oldPaidDays, newPaidDays];
    if (!values.every(Number.isFinite) || workingDays <= 0 || paidDays < 0 || paidDays > workingDays ||
        oldWorkingDays < 0 || newWorkingDays < 0 ||
        Math.abs(oldWorkingDays + newWorkingDays - workingDays) > 0.001 ||
        oldPaidDays < 0 || newPaidDays < 0 || oldPaidDays > oldWorkingDays || newPaidDays > newWorkingDays ||
        Math.abs(oldPaidDays + newPaidDays - paidDays) > 0.001) {
        throw new Error("Manual proration totals do not match");
    }
    return { workingDays: [oldWorkingDays, newWorkingDays], paidDays: [oldPaidDays, newPaidDays] };
};
