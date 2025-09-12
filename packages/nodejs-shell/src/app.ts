#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, LogDestination, LogFormat, Logger, LogLevel } from "#general";
import { createFileLogger } from "#nodejs";
import "@matter/nodejs-ble";
import yargs from "yargs/yargs";
import { MatterNode } from "./MatterNode.js";
import { Shell } from "./shell/Shell";
import { initializeWebPlumbing } from "./web_plumbing.js";

const PROMPT = "matter> ";
const DEFAULT_WEBSOCKET_PORT = 3000;
const logger = Logger.get("Shell");
let theShell: Shell;

if (process.stdin?.isTTY) Logger.format = LogFormat.ANSI;

let theNode: MatterNode;

export function setLogLevel(identifier: string, level: string): void {
    let logLevel = LogLevel.INFO;
    switch (level) {
        case "fatal":
            logLevel = LogLevel.FATAL;
            break;
        case "error":
            logLevel = LogLevel.ERROR;
            break;
        case "warn":
            logLevel = LogLevel.WARN;
            break;
        case "debug":
            logLevel = LogLevel.DEBUG;
            break;
    }
    Logger.setDefaultLoglevelForLogger(identifier, logLevel);
}

/**
 * @file Top level application for Matter Node.
 */
async function main() {
    const yargsInstance = yargs(process.argv.slice(2))
        .command(
            "* [node-num] [node-type]",
            "Matter Node Shell",
            yargs => {
                return yargs
                    .positional("node-num", {
                        describe: "Node number for storage",
                        default: 0,
                        type: "number",
                    })
                    .positional("node-type", {
                        describe: "Type of the node",
                        choices: ["controller"],
                        default: "controller",
                        type: "string",
                    })
                    .options({
                        ble: {
                            description: "Enable BLE support.",
                            type: "boolean",
                        },
                        bleHciId: {
                            description:
                                "HCI ID of the BLE adapter to use. The provided value will be persisted for future runs.",
                            type: "number",
                            default: 0,
                        },
                        factoryReset: {
                            description: "Factory-Reset storage of this node.",
                            default: false,
                            type: "boolean",
                        },
                        netInterface: {
                            description: "Network interface to use for MDNS announcements and scanning.",
                            type: "string",
                            default: undefined,
                        },
                        logfile: {
                            description:
                                "Logfile to use to log to. By Default debug loglevel is logged to the file. The provided value will be persisted for future runs.",
                            type: "string",
                            default: undefined,
                        },
                        webSocketInterface: {
                            description: "Enable WebSocket interface",
                            type: "boolean",
                            default: false,
                        },
                        webSocketPort: {
                            description: "WebSocket and HTTP server port",
                            type: "number",
                            default: DEFAULT_WEBSOCKET_PORT,
                        },
                        webServer: {
                            description: "Enable Web server when using WebSocket interface",
                            type: "boolean",
                            default: false,
                        },
                    });
            },
            async argv => {
                if (argv.help) return;

                const {
                    nodeNum,
                    ble,
                    bleHciId,
                    nodeType,
                    factoryReset,
                    netInterface,
                    logfile,
                    webSocketInterface,
                    webSocketPort,
                    webServer,
                } = argv;

                theNode = new MatterNode(nodeNum, netInterface);
                await theNode.initialize(factoryReset);

                if (logfile !== undefined) {
                    await theNode.Store.set("LogFile", logfile);
                }
                if (await theNode.Store.has("LogFile")) {
                    const storedLogFileName = await theNode.Store.get<string>("LogFile");
                    if (storedLogFileName !== undefined) {
                        Logger.destinations.file = LogDestination({
                            write: await createFileLogger(storedLogFileName),
                            level: LogLevel(await theNode.Store.get<LogLevel>("LoglevelFile", LogLevel.DEBUG)),
                            format: LogFormat("plain"),
                        });
                    }
                }
                setLogLevel("default", await theNode.Store.get<string>("LogLevel", "info"));

                if (webSocketInterface) {
                    Logger.format = LogFormat.PLAIN;
                    initializeWebPlumbing(theNode, nodeNum, webSocketPort, webServer); // set up but wait for connect to create Shell
                } else {
                    theShell = new Shell(theNode, nodeNum, PROMPT, process.stdin, process.stdout);
                }

                if (bleHciId !== undefined) {
                    Environment.default.vars.set("ble.hci.id", bleHciId);
                }

                if (ble) {
                    Environment.default.vars.set("ble.enable", true);
                }

                console.log(`Started Node #${nodeNum} (Type: ${nodeType}) ${ble ? "with" : "without"} BLE`);
                if (!webSocketInterface) {
                    theShell.start(theNode.storageLocation);
                }
            },
        )
        .version(false)
        .scriptName("shell")
        .strict();
    await yargsInstance.wrap(yargsInstance.terminalWidth()).parseAsync();
}

process.on("message", function (message) {
    console.log(`Message to shell.ts: ${message}`);

    switch (message) {
        case "exit":
            exit().catch(error => logger.error(error));
    }
});

export async function exit(code = 0) {
    process.off("SIGINT", sigIntHandler);
    process.emit("SIGINT");
    process.exit(code);
}

const sigIntHandler = () => {
    // Pragmatic way to make sure the storage is correctly closed before the process ends.
    exit().catch(error => logger.error(error));
};

process.on("SIGINT", sigIntHandler);

Environment.default.runtime.add(main());
