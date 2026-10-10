/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Stand-in for the matterjs-server entry point. Plain JavaScript because the child process is plain Node and
// cannot load the TypeScript fake server.
import { renameSync, writeFileSync } from "node:fs";
import { WebSocketServer } from "ws";

const args = process.argv.slice(2);
console.log(`fake-server args: ${JSON.stringify(args)}`);

// The test reads the pid and storage path from here, also when start() fails and no log is reachable
const reportFile = process.env.FAKE_SERVER_REPORT;

// Renamed into place so a reader never sees a partly written file
function writeReport(report) {
    const temporary = `${reportFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(report));
    renameSync(temporary, reportFile);
}
const storageIndex = args.indexOf("--storage-path");
const storagePath = storageIndex === -1 ? undefined : args[storageIndex + 1];

if (reportFile) {
    writeReport({ pid: process.pid, storagePath });
}
runServer();

function runServer() {
    if (args.includes("--ignore-sigterm")) {
        process.on("SIGTERM", () => console.log("fake-server ignoring SIGTERM"));
    }

    if (args.includes("--exit-early")) {
        console.error("fake-server failing on purpose");
        process.exit(3);
    }

    if (args.includes("--never-listen")) {
        // Alive, but the port is never opened
        console.log("fake-server not listening");
        setInterval(() => {}, 1 << 30);
    } else {
        const portIndex = args.indexOf("--port");
        if (portIndex === -1) {
            console.error("fake-server needs --port");
            process.exit(2);
        }

        const serverInfo = {
            fabric_id: 1,
            compressed_fabric_id: 2,
            schema_version: 13,
            min_supported_schema_version: 11,
            sdk_version: "fake-server-entry",
            wifi_credentials_set: false,
            thread_credentials_set: false,
            bluetooth_enabled: false,
        };

        const server = new WebSocketServer({ host: "127.0.0.1", port: Number(args[portIndex + 1]) });
        server.on("connection", socket => socket.send(JSON.stringify(serverInfo)));
        server.on("listening", () => console.log("fake-server listening"));
    }
}
