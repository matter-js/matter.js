/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "@matter/node";
import { TemperatureSensorDevice } from "@matter/node/devices/temperature-sensor";
import { DeviceMessage } from "../common/message.js";
import { boot } from "../common/process-child.js";
import "../common/test-environment.js";

const DISCRIMINATOR = 3840;
const PASSCODE = 20202021;

let node: ServerNode | undefined;

boot<DeviceMessage>({
    async start() {
        node = await ServerNode.create({
            commissioning: {
                discriminator: DISCRIMINATOR,
                passcode: PASSCODE,
            },
        });
        await node.add(TemperatureSensorDevice);
        await node.start();
        return { discriminator: DISCRIMINATOR, passcode: PASSCODE };
    },

    async "await-online"() {
        if (!node) {
            throw new Error("Device not started");
        }
        // If still online, wait for offline first (factory reset hasn't started yet)
        if (node.lifecycle.isOnline) {
            await new Promise<void>(resolve => node!.lifecycle.offline.once(() => resolve()));
        }
        // Wait for the node to come back online
        await new Promise<void>(resolve => node!.lifecycle.online.once(() => resolve()));
        // The CommissioningServer.#enterOnlineMode reaction opens the commissioning window
        // asynchronously after lifecycle.online fires.  We must wait for it to complete
        // before the controller can commission.  Use node.act() which waits for the node's
        // lifecycle mutex, ensuring all pending operations are done.
        await node.lifecycle.mutex.produce(async () => {});
    },

    async stop() {
        if (node) {
            await node.close();
            node = undefined;
        }
    },
});
