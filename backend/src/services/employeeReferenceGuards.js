import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import Shift from "../models/Shift.js";
import Employee from "../models/Employee.js";

// Every assignment and deactivation writes the same referenced document in its
// transaction. MongoDB then detects competing snapshot transactions as write conflicts.
const lockActive = async (Model, id, session, label) => {
    if (!id) return null;
    const locked = await Model.findOneAndUpdate(
        { _id: id, isActive: true },
        { $inc: { assignmentVersion: 1 } },
        { new: true, session }
    );
    if (!locked) {
        const error = new Error(`Selected ${label} is missing or inactive`);
        error.code = "REFERENCE_INACTIVE";
        error.statusCode = 409;
        throw error;
    }
    return locked;
};

export const lockEmployeeReferences = async ({ departmentId, designationId, shiftId = null, session }) => {
    const department = await lockActive(Department, departmentId, session, "department");
    const designation = await lockActive(Designation, designationId, session, "designation");
    if (designation.department.toString() !== department._id.toString()) {
        const error = new Error("Designation does not belong to selected department");
        error.code = "REFERENCE_MISMATCH";
        error.statusCode = 409;
        throw error;
    }
    const shift = shiftId ? await lockActive(Shift, shiftId, session, "shift") : null;
    return { department, designation, shift };
};

export const lockDepartmentReference = (id, session) => lockActive(Department, id, session, "department");
export const lockDesignationReference = (id, session) => lockActive(Designation, id, session, "designation");
export const lockShiftReference = (id, session) => lockActive(Shift, id, session, "shift");

export const lockReportingManager = async (managerId, session) => {
    if (!managerId) return null;
    const manager = await Employee.findOneAndUpdate(
        { _id: managerId, employmentStatus: "active", isArchived: { $ne: true } },
        { $inc: { hierarchyVersion: 1 } },
        { new: true, session }
    );
    if (!manager) {
        const error = new Error("Selected reporting manager is inactive or unavailable");
        error.code = "MANAGER_INACTIVE";
        error.statusCode = 409;
        throw error;
    }
    return manager;
};
