import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerMongoConnectionEvents } from "../src/utils/mongoConnectionEvents.js";

test("MongoDB lifecycle events are logged without exposing connection details", () => {
    const connection = new EventEmitter();
    const logs = [];
    const logger = {
        log: (...args) => logs.push(["log", ...args]),
        error: (...args) => logs.push(["error", ...args])
    };

    registerMongoConnectionEvents(connection, logger);

    connection.emit("connected");
    connection.emit("reconnected");
    connection.emit("disconnected");
    connection.emit("error", new Error("network unavailable"));

    assert.deepEqual(logs, [
        ["log", "MongoDB connection established."],
        ["log", "MongoDB connection restored."],
        ["error", "MongoDB connection lost. Mongoose will attempt to reconnect."],
        ["error", "MongoDB connection error:", "network unavailable"]
    ]);
});
