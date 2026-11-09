import Department from "../models/Department.js";
import Designation from "../models/Designation.js";

// Add the standard HRMS departments once; never overwrite existing master data.
const defaultDepartments = [
    { name: "AI", code: "AI", description: "Artificial Intelligence" },
    { name: "Data Science", code: "DATA", description: "Data Science and Analytics" },
    { name: "Mechanical", code: "MECH", description: "Mechanical Engineering" },
    { name: "Electrical", code: "ELEC", description: "Electrical Engineering" },
    { name: "IT", code: "IT", description: "Information Technology" }
];

const defaultDesignations = {
    AI: ["AI Engineer", "Machine Learning Engineer", "AI Researcher"],
    "Data Science": ["Data Scientist", "Data Analyst", "Data Engineer"],
    Mechanical: ["Mechanical Engineer", "Design Engineer", "Production Engineer"],
    Electrical: ["Electrical Engineer", "Electronics Engineer", "Maintenance Engineer"],
    IT: ["Software Developer", "IT Support Engineer", "System Administrator", "Network Engineer"]
};

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

    // Seed common designations for each standard department without overwriting existing records.
    for (const [departmentName, names] of Object.entries(defaultDesignations)) {
        const department = await Department.findOne({ name: departmentName, isActive: true });
        if (!department) continue;

        for (const name of names) {
            const existing = await Designation.findOne({ name, department: department._id });
            if (!existing) {
                try {
                    await Designation.create({ name, department: department._id });
                    console.log(`Default designation added: ${departmentName} / ${name}`);
                } catch (error) {
                    if (error.code !== 11000) throw error;
                }
            }
        }
    }
};
