/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { ContinuousDiscovery } from "#behavior/system/controller/discovery/ContinuousDiscovery.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ChannelType, Seconds } from "@matter/general";
import {
    type CommissionableDevice,
    type CommissionableDeviceIdentifiers,
    type Scanner,
    ScannerSet,
} from "@matter/protocol";
import { MockServerNode } from "../../../../node/mock-server-node.js";

/**
 * Reports each device once per discovery, as the real scanners do, and keeps scanning until discovery stops.
 */
class OncePerDiscoveryScanner implements Scanner {
    readonly type = ChannelType.UDP;

    constructor(readonly devices: CommissionableDevice[]) {}

    async findCommissionableDevicesContinuously(
        _identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        _timeout?: unknown,
        cancelSignal?: Promise<void>,
    ) {
        for (const device of this.devices) {
            callback({ ...device });
        }
        await cancelSignal;
        return this.devices;
    }

    getDiscoveredCommissionableDevices() {
        return this.devices;
    }

    cancelCommissionableDeviceDiscovery() {}

    async close() {}
}

const DEVICE: CommissionableDevice = {
    deviceIdentifier: "device-a",
    D: 1000,
    CM: 1,
    addresses: [{ type: "udp", ip: "fe80::1", port: 5540 }],
};

async function configure(node: ServerNode, devices: CommissionableDevice[]) {
    node.behaviors.require(ControllerBehavior);
    await node.act(agent => agent.load(ControllerBehavior));

    const set = node.env.get(ScannerSet);
    set.clear();
    set.add(new OncePerDiscoveryScanner(devices));
}

function peersFor(node: ServerNode, deviceIdentifier: string) {
    return [...node.peers].filter(peer => peer.state.commissioning.deviceIdentifier === deviceIdentifier);
}

describe("ContinuousDiscovery", () => {
    it("creates one node for a device that concurrent discoveries report while it is constructed", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE]);

            const first = new ContinuousDiscovery(node, { timeout: Seconds(5) });
            const second = new ContinuousDiscovery(node, { timeout: Seconds(5) });
            const [firstResult, secondResult] = await MockTime.resolve(Promise.all([first, second]), {
                macrotasks: true,
            });

            const peers = peersFor(node, "device-a");
            expect(peers.length).equals(1);
            for (const result of [firstResult, secondResult]) {
                expect(result.length).equals(1);
                expect(result[0]).equals(peers[0]);
            }
        } finally {
            await node.close();
        }
    });
});
