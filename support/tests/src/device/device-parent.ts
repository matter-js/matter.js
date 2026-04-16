/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ParentProcess } from "../common/process-parent.js";

/**
 * Client interface for managing a test device implemented in device-child.ts.
 */
export class TestDevice extends ParentProcess {
    static #default?: TestDevice;

    private constructor() {
        super("device/device-child.js");
    }

    static get default() {
        if (!this.#default) {
            this.#default = new TestDevice();
        }
        return this.#default;
    }

    async start() {
        return (await this.send({ kind: "start" })) as { discriminator: number; passcode: number };
    }

    async awaitOnline() {
        await this.send({ kind: "await-online" });
    }

    async stop() {
        await this.send({ kind: "stop" });
    }
}
