/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { ValidationError } from "@matter/main/types";
import { AllDevicesTestInstance } from "../../src/AllDevicesTestInstance.js";
import { listLeafDeviceTypes } from "../../src/devices/DeviceTypeRegistry.js";

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

    it("adds an aggregator on endpoint 1 without --device", async () => {
        const node = await setupWith();
        try {
            expect([...node.parts].map(({ number, type }) => [number, type.name])).deep.equals([[1, "Aggregator"]]);
        } finally {
            await node.close();
        }
    });

    it("adds every leaf device type for * on a node with groupcast", async () => {
        const node = await setupWith("--device", "*", "--groupcast");
        try {
            expect([...node.parts].length).equals(listLeafDeviceTypes().length);

            const numbers = new Array<number>();
            const collect = (endpoint: Endpoint) => {
                for (const part of endpoint.parts) {
                    numbers.push(part.number);
                    collect(part);
                }
            };
            collect(node);
            expect(new Set(numbers).size).equals(numbers.length);
        } finally {
            await node.close();
        }
    });

    it("numbers the devices of *:N from N", async () => {
        const node = await setupWith("--device", "*:3");
        try {
            const numbers = [...node.parts].map(({ number }) => number);
            expect(numbers.slice(0, listLeafDeviceTypes().length)).deep.equals(
                listLeafDeviceTypes().map((_type, index) => 3 + index),
            );
        } finally {
            await node.close();
        }
    });

    it("refuses an endpoint number given twice", async () => {
        await expect(setupWith("--device", "on-off-light:3", "--device", "dimmable-light:3")).rejectedWith(
            ValidationError,
            "Endpoint 3 declared twice in --device flags",
        );
    });
});
