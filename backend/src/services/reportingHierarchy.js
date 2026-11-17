import Employee from "../models/Employee.js";

// Walk upward from the proposed manager. A cycle exists if the employee being
// edited is encountered, or if the existing chain is already cyclic.
export const createsReportingCycle = async (employeeId, managerId) => {
    const targetId = String(employeeId);
    let currentId = String(managerId);
    const visited = new Set();

    while (currentId) {
        if (currentId === targetId || visited.has(currentId)) {
            return true;
        }
        visited.add(currentId);

        const current = await Employee.findById(currentId)
            .select("reportingManager")
            .lean();
        if (!current) {
            return false;
        }
        currentId = current.reportingManager ? String(current.reportingManager) : null;
    }

    return false;
};
