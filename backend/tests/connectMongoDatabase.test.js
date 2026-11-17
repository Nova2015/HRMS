import test from "node:test";
import assert from "node:assert/strict";
import { connectMongoDatabase } from "../src/utils/connectMongoDatabase.js";

test("MongoDB connection logs the connected host and database", async () => {
    const calls = [];
    const connection = { connection: { host: "localhost", name: "hrms" } };
    const mongoose = {
        connect: async (uri) => {
            calls.push(["connect", uri]);
            return connection;
        }
    };
    const logger = { log: (...args) => calls.push(["log", ...args]) };

    const result = await connectMongoDatabase({ mongoose, uri: "mongodb://localhost/hrms", logger });

    assert.equal(result, connection);
    assert.deepEqual(calls, [
        ["connect", "mongodb://localhost/hrms"],
        ["log", "MongoDB Connected: localhost"],
        ["log", "Database: hrms"]
    ]);
});

test("MongoDB connection errors propagate to the server startup handler", async () => {
    const connectionError = new Error("database unavailable");
    let connectCalls = 0;
    const mongoose = {
        connect: async () => {
            connectCalls += 1;
            throw connectionError;
        }
    };
    const logger = { log() {} };

    await assert.rejects(
        connectMongoDatabase({ mongoose, uri: "mongodb://localhost/hrms", logger }),
        (error) => error === connectionError
    );
    assert.equal(connectCalls, 1);
});
