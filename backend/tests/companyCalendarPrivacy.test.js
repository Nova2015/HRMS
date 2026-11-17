import test from "node:test";
import assert from "node:assert/strict";
import CompanyEvent from "../src/models/CompanyEvent.js";
import { getCompanyEvents } from "../src/controllers/companyEventController.js";

const originalFind = CompanyEvent.find;

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

test("shared company calendar never returns Google account mapping metadata", async () => {
    const calls = [];
    const event = {
        title: "Town hall",
        googleCalendarMappings: [{
            userId: "64b000000000000000000001",
            calendarId: "primary",
            googleEventId: "private-google-event-id"
        }]
    };
    CompanyEvent.find = () => ({
        select(value) { calls.push(["select", value]); return this; },
        populate(...args) { calls.push(["populate", ...args]); return this; },
        sort(value) { calls.push(["sort", value]); return this; },
        limit(value) { calls.push(["limit", value]); return this; },
        lean() { return Promise.resolve([event]); }
    });

    try {
        const res = response();
        await getCompanyEvents({
            query: {},
            user: { role: "employee", employeeId: "64b000000000000000000002" }
        }, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(calls[0], ["select", "-googleCalendarMappings"]);
        assert.equal(res.body.data[0].title, "Town hall");
    } finally {
        CompanyEvent.find = originalFind;
    }
});

test.after(() => {
    CompanyEvent.find = originalFind;
});
