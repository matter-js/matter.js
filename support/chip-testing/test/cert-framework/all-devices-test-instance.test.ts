/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "@matter/main/types";
import { AllDevicesTestInstance } from "../../src/AllDevicesTestInstance.js";

function setupWith(...appArgs: string[]) {
    return new AllDevicesTestInstance({ commandPipeFactory: async () => {}, appArgs }).setupServer();
}

describe("AllDevicesTestInstance --device", () => {
    it("refuses an endpoint number that is not a valid endpoint", async () => {
        await expect(setupWith("--device", "on-off-light:0")).rejectedWith(
            ValidationError,
            'Invalid endpoint in --device "on-off-light:0"',
        );
        await expect(setupWith("--device", "on-off-light:0xffff")).rejectedWith(ValidationError, "Invalid endpoint");
    });

    it("refuses an unsupported device type", async () => {
        await expect(setupWith("--device", "on-off-light", "--device", "no-such-device")).rejectedWith(
            ValidationError,
            'unsupported --device "no-such-device"',
        );
    });

    it("refuses an endpoint number given twice", async () => {
        await expect(setupWith("--device", "on-off-light:3", "--device", "dimmable-light:3")).rejectedWith(
            ValidationError,
            "Endpoint 3 declared twice in --device flags",
        );
    });
});
