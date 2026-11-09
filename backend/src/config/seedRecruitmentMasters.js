import Department from "../models/Department.js";

// Add the standard HRMS departments once; never overwrite existing master data.
const defaultDepartments = [
    { name: "AI", code: "AI", description: "Artificial Intelligence" },
    { name: "Data Science", code: "DATA", description: "Data Science and Analytics" },
    { name: "Mechanical", code: "MECH", description: "Mechanical Engineering" },
    { name: "Electrical", code: "ELEC", description: "Electrical Engineering" },
    { name: "IT", code: "IT", description: "Information Technology" }
];

export const seedRecruitmentMasters = async () => {
    for (const item of defaultDepartments) {
        const existing = await Department.findOne({
            name: { $regex: `^${item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
        });
        if (!existing) {
            try {
                await Department.create(item);
                console.log(`Default department added: ${item.name}`);
            } catch (error) {
                if (error.code !== 11000) throw error;
            }
        }
    }
};
