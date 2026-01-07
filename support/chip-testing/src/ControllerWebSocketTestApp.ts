#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is a chip-tool compatible WebSocket Controller.
 *
 * The controller logs are returned to chip tool and also logged into a file test_controller.log.
 */

import { Logger } from "@matter/general";
import { createFileLogger } from "@matter/nodejs";
import { writeFileSync } from "node:fs";
import { ControllerTestInstance, startControllerTestApp } from "./ControllerTestInstance.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

Logger.destinations.default.write = await createFileLogger("./test_controller.log");

const logger = Logger.get("ControllerWebSocketTestApp");
logger.info("Start Controller WebSocket App");
logger.info(process.pid);
logger.info(process.argv);

process.on("unhandledRejection", reason => {
    writeFileSync("error.log", `Rejection: ${(reason as Error)?.stack ?? reason}\n`);
});
process.on("uncaughtException", error => {
    writeFileSync("error.log", `Exception: ${error.stack}\n`);
});

//if (process.argv.includes("--test")) {
startControllerTestApp(ControllerTestInstance, StorageBackendAsyncJsonFile).catch(error =>
    logger.error("Error starting ControllerTestInstance", error),
);
//} else {
//    console.log("== WebSocket Server Ready");
//    setTimeout(() => process.exit(), 5000000);
//}
