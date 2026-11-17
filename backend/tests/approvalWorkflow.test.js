import test from "node:test";
import assert from "node:assert/strict";

import { reviewLeaveRequest } from "../src/controllers/leaveController.js";
import { reviewExpenseClaim } from "../src/controllers/expenseController.js";
import { decideEmployeeUpdateProposal } from "../src/controllers/employeeUpdateApprovalController.js";

import Employee from "../src/models/Employee.js";
import LeaveRequest from "../src/models/LeaveRequest.js";
import ExpenseClaim from "../src/models/ExpenseClaim.js";
import EmployeeUpdateApproval from "../src/models/EmployeeUpdateApproval.js";

const IDS = {
    request: "64b000000000000000000001",
    manager: "64b000000000000000000002",
    teamEmployee: "64b000000000000000000003",
    otherEmployee: "64b000000000000000000004",
    user: "64b000000000000000000005"
};

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    }
});

const withModelStubs = async (stubs, run) => {
    const targets = { Employee, LeaveRequest, ExpenseClaim, EmployeeUpdateApproval };
    const originals = Object.entries(stubs).map(([targetName, methods]) => ({
        target: targets[targetName],
        methods: Object.entries(methods).map(([name, implementation]) => ({
            name,
            original: target[name],
            implementation
        }))
    }));

    for (const group of originals) {
        for (const method of group.methods) {
            group.target[method.name] = method.implementation;
        }
    }

    try {
        await run();
    } finally {
        for (const group of originals) {
            for (const method of group.methods) {
                group.target[method.name] = method.original;
            }
        }
    }
};

const populatedQuery = (value) => ({
    populate() {
        return this;
    },
    value
});

test("Manager can review a pending leave request from an assigned team member", async () => {
    let capturedFilter;
    const teamIds = [IDS.teamEmployee];

    await withModelStubs({
        Employee: {
            find: (filter) => ({
                distinct: async (field) => {
                    assert.deepEqual(filter, { reportingManager: IDS.manager });
                    assert.equal(field, "_id");
                    return teamIds;
                }
            })
        },
        LeaveRequest: {
            findOneAndUpdate: async (filter) => {
                capturedFilter = filter;
                return { _id: IDS.request };
            },
            findById: () => populatedQuery({ _id: IDS.request })
        }
    }, async () => {
        const req = {
            params: { id: IDS.request },
            body: { decision: "approved", reviewComment: "Reviewed" },
            user: { role: "manager", employeeId: IDS.manager, userId: IDS.user }
        };
        const res = createResponse();

        await reviewLeaveRequest(req, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(capturedFilter, {
            _id: IDS.request,
            status: "pending",
            employee: { $in: teamIds }
        });
    });
});

test("Manager cannot review a leave request outside the assigned team", async () => {
    let capturedDecisionFilter;
    let capturedExistsFilter;
    await withModelStubs({
        Employee: {
            find: () => ({ distinct: async () => [IDS.teamEmployee] })
        },
        LeaveRequest: {
            findOneAndUpdate: async (filter) => {
                capturedDecisionFilter = filter;
                return null;
            },
            exists: async (filter) => {
                capturedExistsFilter = filter;
                return false;
            }
        }
    }, async () => {
        const req = {
            params: { id: IDS.request },
            body: { decision: "rejected", reviewComment: "Not my team" },
            user: { role: "manager", employeeId: IDS.manager, userId: IDS.user }
        };
        const res = createResponse();

        await reviewLeaveRequest(req, res);

        assert.equal(res.statusCode, 404);
        assert.deepEqual(capturedDecisionFilter.employee, { $in: [IDS.teamEmployee] });
        assert.deepEqual(capturedExistsFilter.employee, { $in: [IDS.teamEmployee] });
    });
});

test("Admin and HR leave reviews are not restricted to a manager team", async () => {
    for (const role of ["admin", "hr"]) {
        let capturedFilter;
        await withModelStubs({
            LeaveRequest: {
                findOneAndUpdate: async (filter) => {
                    capturedFilter = filter;
                    return { _id: IDS.request };
                },
                findById: () => populatedQuery({ _id: IDS.request })
            }
        }, async () => {
            const req = {
                params: { id: IDS.request },
                body: { decision: "approved" },
                user: { role, userId: IDS.user }
            };
            const res = createResponse();

            await reviewLeaveRequest(req, res);

            assert.equal(res.statusCode, 200, role);
            assert.deepEqual(capturedFilter, { _id: IDS.request, status: "pending" });
        });
    }
});

test("A leave request that is no longer pending cannot be reviewed twice", async () => {
    await withModelStubs({
        LeaveRequest: {
            findOneAndUpdate: async () => null,
            exists: async () => true
        }
    }, async () => {
        const req = {
            params: { id: IDS.request },
            body: { decision: "approved" },
            user: { role: "admin", userId: IDS.user }
        };
        const res = createResponse();

        await reviewLeaveRequest(req, res);

        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Only pending leave requests/);
    });
});

test("Admin and HR can review pending expense claims", async () => {
    for (const role of ["admin", "hr"]) {
        let capturedFilter;
        await withModelStubs({
            ExpenseClaim: {
                findOneAndUpdate: async (filter) => {
                    capturedFilter = filter;
                    return { _id: IDS.request };
                },
                findById: () => populatedQuery({ _id: IDS.request })
            }
        }, async () => {
            const req = {
                params: { id: IDS.request },
                body: { decision: "approved", reviewComment: "Receipt checked" },
                user: { role, userId: IDS.user }
            };
            const res = createResponse();

            await reviewExpenseClaim(req, res);

            assert.equal(res.statusCode, 200, role);
            assert.deepEqual(capturedFilter, { _id: IDS.request, status: "pending" });
        });
    }
});

test("An expense claim that is no longer pending cannot be reviewed twice", async () => {
    await withModelStubs({
        ExpenseClaim: {
            findOneAndUpdate: async () => null,
            exists: async () => true
        }
    }, async () => {
        const req = {
            params: { id: IDS.request },
            body: { decision: "rejected" },
            user: { role: "hr", userId: IDS.user }
        };
        const res = createResponse();

        await reviewExpenseClaim(req, res);

        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /Only pending claims/);
    });
});

test("An employee update proposal already decided cannot be processed again", async () => {
    await withModelStubs({
        EmployeeUpdateApproval: {
            findOne: async (filter) => {
                assert.deepEqual(filter, { _id: IDS.request, status: "pending" });
                return null;
            }
        }
    }, async () => {
        const req = {
            params: { id: IDS.request },
            body: { decision: "reject", note: "Already reviewed" },
            user: { role: "admin", userId: IDS.user }
        };
        const res = createResponse();

        await decideEmployeeUpdateProposal(req, res);

        assert.equal(res.statusCode, 404);
        assert.match(res.body.message, /already decided/i);
    });
});
