/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Stand-in for the matterjs-server entry point. Plain JavaScript because the child process is plain Node and
// cannot load the TypeScript fake server.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

const certContext = loadCertContext();
const revocationSets = loadRevocationSets();

if (reportFile) {
    writeReport({ pid: process.pid, storagePath, environment: Object.keys(process.env), certContext, revocationSets });
}
runServer();

/** Logs what the real server logs for a cert-context.json in its storage, or refuses it as the real server does. */
function loadCertContext() {
    const path = storagePath === undefined ? undefined : join(storagePath, "cert-context.json");
    if (path === undefined || !existsSync(path)) {
        return undefined;
    }
    const content = JSON.parse(readFileSync(path, "utf8"));
    if (args.includes("--cert-context-refuse")) {
        console.log(
            `2026-10-16 06:46:37.222 FATAL MatterServer Server failed to start Invalid group key configuration ${path}: ` +
                "keySets[0].groupKeySetId must not be 0, which is the fabric IPK",
        );
        console.log("  at Parser.fail (certContext.js:65:11)");
        if (args.includes("--cert-context-slow-exit")) {
            // The real server awaits its shutdown after a failed start before it exits
            setInterval(() => {}, 1 << 30);
            return content;
        }
        process.exit(1);
    }
    if (!args.includes("--cert-context-ignore")) {
        const extra = args.includes("--cert-context-miscount") ? 1 : 0;
        const extraGroups = args.includes("--cert-context-group-miscount") ? 1 : 0;
        const loadedFrom = args.includes("--cert-context-other-path") ? "/elsewhere/cert-context.json" : path;
        console.log(
            `2026-10-16 06:46:44.840 NOTICE GroupKeyConfig Loaded group key configuration from ${loadedFrom}: ` +
                `${content.keySets.length + extra} key sets, ${content.groupKeyMap.length + extraGroups} groups`,
        );
    }
    if (args.includes("--cert-context-install-fail")) {
        // The real server installs the file after it read it, and awaits its shutdown after a failed start
        console.log(
            "2026-10-16 06:46:45.001 FATAL MatterServer Server failed to start Cannot install group key configuration: " +
                "storage closed",
        );
        setInterval(() => {}, 1 << 30);
    }
    return content;
}

/**
 * Logs what the real server logs for the revocation sets in the directory `--revocation-sets-dir` names
 * (`loadRevocationSets`): an ERROR for a file or directory it cannot install from, which it skips, then a NOTICE with
 * what it loaded or a WARN where it loaded nothing from a directory it could read.
 */
function loadRevocationSets() {
    const dirIndex = args.indexOf("--revocation-sets-dir");
    if (dirIndex === -1) {
        return undefined;
    }
    const dir = args[dirIndex + 1];
    const log = (level, message) => console.log(`2026-10-16 09:12:01.204 ${level} MatterServer.RevocationSets ${message}`);
    const files = {};
    if (args.includes("--revocation-unreadable-dir")) {
        log("ERROR", `Cannot read revocation sets directory ${dir}: EACCES: permission denied`);
        return { dir, files };
    }
    let loaded = 0;
    let entries = 0;
    for (const name of readdirSync(dir).filter(name => name.endsWith(".json"))) {
        files[name] = readFileSync(join(dir, name), "utf8");
        if (args.includes("--revocation-refuse")) {
            log("ERROR", `Skipped revocation set ${name}: Revocation set entry 0 is not an object`);
            continue;
        }
        loaded++;
        entries += JSON.parse(files[name]).length;
    }
    if (loaded === 0) {
        log("WARN", `No revocation sets installed from ${dir}`);
    } else if (!args.includes("--revocation-ignore")) {
        const extra = args.includes("--revocation-miscount") ? 1 : 0;
        const loadedFrom = args.includes("--revocation-other-dir") ? "/elsewhere/revocation-sets" : dir;
        const fileCount = loaded + (args.includes("--revocation-extra-file") ? 1 : 0);
        log("NOTICE", `Loaded revocation sets from ${loadedFrom}: ${fileCount} files, ${entries + extra} entries`);
    }
    return { dir, files };
}

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
            schema_version: 14,
            min_supported_schema_version: 11,
            sdk_version: "fake-server-entry",
            wifi_credentials_set: false,
            thread_credentials_set: false,
            bluetooth_enabled: false,
        };

        // The real server upgrades only this path, so a client connecting anywhere else must fail here too
        const server = new WebSocketServer({ host: "127.0.0.1", port: Number(args[portIndex + 1]), path: "/ws" });
        server.on("connection", socket => socket.send(JSON.stringify(serverInfo)));
        // The readiness line the real server logs once /ws accepts connections, with the port it bound, colored as the
        // real server logs it even into a pipe
        server.on("listening", () =>
            console.log(
                `\x1b[2mINFO \x1b[0;1;90mWebServer \x1b[0;32mWebserver listening on http://127.0.0.1:${server.address().port}\x1b[0m`,
            ),
        );
    }
}
