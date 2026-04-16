/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ParentProcess } from "../common/process-parent.js";

/**
 * Client interface for managing a controller in a child process for heap profiling.
 */
export class ControllerPool extends ParentProcess {
    constructor() {
        super("controller/heap-controller-child.js");
    }

    async start() {
        await this.send({ kind: "start" });
    }

    async commission(discriminator: number, passcode: number, nodeId: number) {
        await this.send({ kind: "commission", discriminator, passcode, nodeId });
    }

    async snapshot(path: string): Promise<string> {
        const result = await this.send({ kind: "snapshot", path });
        return (result as { path: string }).path;
    }

    async stop() {
        await this.send({ kind: "stop" });
    }
}
