export const excludeTestEmployeeStages = () => [
    {
        $lookup: {
            from: "employees",
            localField: "employee",
            foreignField: "_id",
            as: "reportEmployee"
        }
    },
    { $unwind: "$reportEmployee" },
    { $match: { "reportEmployee.isTestRecord": { $ne: true } } }
];
