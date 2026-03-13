/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, MockStorageService, NodeId, Seconds, Time } from "@matter/main";
import { CommissioningController } from "@project-chip/matter.js";
import { writeHeapSnapshot } from "node:v8";
import type { ControllerMessage } from "../common/message.js";
import { boot } from "../common/process-child.js";

new MockStorageService(Environment.default);

let ctl: CommissioningController | undefined;

boot<ControllerMessage>({
    async start() {
        ctl = new CommissioningController({
            environment: { id: "heap-profile-controller", environment: Environment.default },
            adminFabricLabel: "heap-profile-fabric",
        });
        await ctl.start();
    },

    async commission(message) {
        if (!ctl) {
            throw new Error("Controller not started");
        }
        await ctl.commissionNode({
            commissioning: {
                nodeId: NodeId(message.nodeId),
            },
            discovery: {
                identifierData: {
                    longDiscriminator: message.discriminator,
                },
            },
            passcode: message.passcode,
            autoSubscribe: false,
        });
    },

    async snapshot(message) {
        await Time.sleep("settle", Seconds.one);
        writeHeapSnapshot(message.path);
        return { path: message.path };
    },

    async stop() {
        if (ctl) {
            await ctl.close();
            ctl = undefined;
        }
    },
});
