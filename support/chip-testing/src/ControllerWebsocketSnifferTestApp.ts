#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is a manual usage helper to initially sniff WebSocket Messages from a normal chip-tool
 * test run in order to know request-response relations.
 *
 * It will generate a test_sniffer.log file in the directory it was executed from with the details.
 *
 * You need to manually set the path to the chip-tool to execute.
 * TODO: Make the patch configurable
 */

import { Logger } from "@matter/general";
import { createFileLogger } from "@matter/nodejs";
import { spawn } from "node:child_process";
import { WebSocket, WebSocketServer } from "ws";

Logger.destinations.default.write = await createFileLogger("./test_sniffer.log");

const logger = Logger.get("ControllerWebSocketSnifferTestApp");

logger.info("\n\n\nStart Controller App");
logger.info(process.pid);
logger.info(process.argv);

// TODO: Set manually!
const chipPath = "/path/to/chip-tool/executable/darwin-x64-chip-tool/chip-tool";
const cmdLine = [...process.argv.slice(2)];
const port = parseInt(cmdLine[cmdLine.length - 1]);
const chipPort = port + 10000;
cmdLine[cmdLine.length - 1] = chipPort.toString();

logger.info("Start CHIP Tool", chipPath, cmdLine);
const chipProcess = spawn(chipPath, cmdLine);

chipProcess.on("error", (...error) => {
    logger.info("CHIP Tool error", error);
});

chipProcess.on("exit", code => {
    logger.info("CHIP Tool exited with code", code);
    process.exit(code);
});

const waiter = (data: any) => {
    //log("CHIP-stdout", data.toString());
    if (data.toString().includes("== WebSocket Server Ready")) {
        chipProcess.stdout.off("data", waiter);
        logger.info("CHIP Tool ready");
        startWs();
    }
};

chipProcess.stdout.on("data", waiter);

function startWs() {
    const client = new WebSocket(`ws://127.0.0.1:${chipPort}`);

    client.on("error", (...error) => {
        logger.info("CHIP-WebSocket error", error);
    });
    client.on("open", () => {
        logger.info(`CHIP-WebSocket connected on port ${chipPort}`);
    });
    client.on("close", () => {
        logger.info("CHIP-WebSocket closed");
    });
    client.on("message", data => {
        const str = data.toString();
        const json = JSON.parse(str);

        // [ {  \"module\": \"TOO\",  \"category\": \"Info\",  \"message\": \"Q29tbWFuZDogcGFpcmluZyBjb2RlIDB4MTIzNDQzMjEgTVQ6LTI0SjBBRk4wMEtBMDY0OEcwMCA=\"} ]
        // Command: pairing code 0x12344321 MT:-24J0AFN00KA0648G00

        logger.info("CHIP-received", JSON.stringify({ ...json, logs: undefined }));
        currentWs?.send(str);
    });

    const wss = new WebSocketServer({ host: "127.0.0.1", port }, () => {
        logger.info(`WebSocketServer started on port ${port}`);
    });

    let currentWs: WebSocket | null = null;

    wss.on("connection", function connection(ws) {
        currentWs = ws;

        ws.on("error", (...error) => {
            logger.info("TEST-WebSocket error", error);
        });

        ws.on("message", function message(data) {
            if (data) {
                const str = data.toString();
                if (str.startsWith("json:")) {
                    const json = JSON.parse(str.substring(5));
                    if (json.arguments && json.arguments.startsWith("base64:")) {
                        json.arguments = `base64( ${Buffer.from(json.arguments.substring(7), "base64").toString("utf8")} )`;
                    }
                    logger.info("TEST-received-JSON", JSON.stringify(json));
                } else {
                    logger.info("TEST-received-TXT", str);
                }
            } else {
                logger.info("TEST-received-EMPTY", data);
            }
            client.send(data);
        });
    });

    console.log("== WebSocket Server Ready");
}

process.on("SIGINT", () => {
    logger.info("SIGINT received");
    chipProcess.kill();
});

process.on("SIGTERM", () => {
    logger.info("SIGTERM received");
    chipProcess.kill();
});

process.on("exit", () => {
    logger.info("Exit");
    chipProcess.kill();
});

process.on("uncaughtException", err => {
    logger.info("Uncaught Exception", err);
});

process.on("unhandledRejection", (reason, promise) => {
    logger.info("Unhandled Rejection", reason, promise);
});
