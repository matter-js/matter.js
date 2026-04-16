/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "@matter/node";
import { TemperatureSensorDevice } from "@matter/node/devices/temperature-sensor";
import { boot } from "../common/process-child.js";
import "../common/test-environment.js";

interface StartDevice {
    kind: "start-device";
    discriminator: number;
    passcode: number;
    port: number;
}

interface StopAll {
    kind: "stop-all";
}

type DevicesMessage = StartDevice | StopAll;

const nodes = new Map<number, ServerNode>();

boot<DevicesMessage>({
    async "start-device"(message) {
        const node = await ServerNode.create({
            network: {
                port: message.port,
            },
            commissioning: {
                discriminator: message.discriminator,
                passcode: message.passcode,
            },
        });
        await node.add(TemperatureSensorDevice);
        await node.start();
        nodes.set(message.discriminator, node);
        return { discriminator: message.discriminator, passcode: message.passcode };
    },

    async "stop-all"() {
        for (const node of nodes.values()) {
            await node.close();
        }
        nodes.clear();
    },
});
