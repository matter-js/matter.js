/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ParentProcess } from "../common/process-parent.js";

/**
 * Client interface for managing multiple test devices in a single child process.
 */
export class DevicePool extends ParentProcess {
    constructor() {
        super("device/devices-child.js");
    }

    async startDevice(discriminator: number, passcode: number, port: number) {
        return (await this.send({ kind: "start-device", discriminator, passcode, port })) as {
            discriminator: number;
            passcode: number;
        };
    }
}
