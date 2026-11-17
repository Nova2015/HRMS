import test from "node:test";
import assert from "node:assert/strict";

import { assignHelpdeskTicket } from "../src/controllers/helpdeskController.js";
import HelpdeskTicket from "../src/models/HelpdeskTicket.js";

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

test("assignment compare-and-set rejects a ticket closed after it was read", async () => {
    const originalFindOne = HelpdeskTicket.findOne;
    const originalFindOneAndUpdate = HelpdeskTicket.findOneAndUpdate;
    let updateFilter;
    let saveCalled = false;

    HelpdeskTicket.findOne = async () => ({
        _id: "64b000000000000000000001",
        status: "open",
        ticketType: "general",
        save: async () => { saveCalled = true; }
    });
    HelpdeskTicket.findOneAndUpdate = async (filter) => {
        updateFilter = filter;
        // Simulate another request closing the ticket after the initial read.
        return null;
    };

    try {
        const req = {
            params: { id: "64b000000000000000000001" },
            body: { assignedTo: null },
            user: { role: "admin", userId: "64b000000000000000000002" }
        };
        const res = createResponse();

        await assignHelpdeskTicket(req, res);

        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /status changed by another request/i);
        assert.deepEqual(updateFilter, {
            _id: "64b000000000000000000001",
            status: "open"
        });
        assert.equal(saveCalled, false);
    } finally {
        HelpdeskTicket.findOne = originalFindOne;
        HelpdeskTicket.findOneAndUpdate = originalFindOneAndUpdate;
    }
});
