/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import { ControllerTestInstance, ControllerTestInstanceConfig } from "./ControllerTestInstance.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

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
export async function startLocalController(options?: { port?: number; storagePath?: string }) {
    const port = options?.port ?? 9002;
    const storagePath = options?.storagePath ?? "/tmp/local-controller-kvs";

    const storage = new StorageBackendAsyncJsonFile(storagePath);

    const config: ControllerTestInstanceConfig = {
        storage,
        websocketPort: port,
    };

    const testInstance = new ControllerTestInstance(config);
    await testInstance.initialize();
    await testInstance.start();

    logger.info(`Local controller started on port ${port}`);

    return async () => {
        logger.info("Closing local controller");
        await testInstance.close();
    };
}
