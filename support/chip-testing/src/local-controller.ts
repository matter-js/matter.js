/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControllerTestInstance, ControllerTestInstanceConfig } from "./ControllerTestInstance.js";

const logger = Logger.get("LocalController");

/**
 * Start a local matter.js controller for WebSocket-based YAML testing.
 *
 * Creates a {@link ControllerTestInstance} with three identities (alpha, beta, gamma) and a WebSocket server on the
 * specified port.  The controller runs in-process alongside the DUT, isolated via separate {@link Environment}
 * instances.
 *
 * @returns a close function to shut down the controller
 */
export async function startLocalController(options?: { port?: number; storagePrefix?: string }) {
    const port = options?.port ?? 9002;

    // A run of the YAML corpus commissions from scratch, so the identities must not find the fabrics of
    // whatever ran here last: without a prefix of its own each run gets a fresh directory.
    const storagePrefix =
        options?.storagePrefix ?? join(await mkdtemp(join(tmpdir(), "matter-local-controller-")), "kvs");

    const config: ControllerTestInstanceConfig = {
        storagePrefix,
        websocketPort: port,
    };

    const testInstance = new ControllerTestInstance(config);
    await testInstance.initialize();
    await testInstance.start();

    logger.info(`Local controller started on port ${port}, storage ${storagePrefix}`);

    return async () => {
        logger.info("Closing local controller");
        await testInstance.close();
    };
}
