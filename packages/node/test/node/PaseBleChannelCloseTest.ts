/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { Bytes, causedBy, ChannelType, Seconds, Time, Transport, TransportSet } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { BleChannel, BleChannelClosedError, ControllerCommissioner, FabricAuthority } from "@matter/protocol";

/** A peripheral that accepts the first PASE message, never answers and then loses the link. */
class SilentBleChannel extends BleChannel<Bytes> {
    readonly name = "ble://silent";
    lostAt?: number;
    closedAt?: number;

    async send() {
        if (this.lostAt === undefined) {
            this.lostAt = Time.nowMs;
            this.emitClosed();
        }
    }

    async close() {
        this.closedAt ??= Time.nowMs;
        this.emitClosed();
    }

    onClose(): Transport.Listener {
        return { close: async () => {} };
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return { next: () => new Promise(() => {}) };
    }
}

describe("PASE over BLE", () => {
    before(() => {
        MockTime.init();
    });

    it("ends the PASE session as soon as its BLE channel closes", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        await controller.start();
        await controller.act(agent => agent.load(ControllerBehavior));
        const fabricConfig = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
        const fabric = await controller.env.get(FabricAuthority).defaultFabric(fabricConfig);

        const channel = new SilentBleChannel();
        controller.env.get(TransportSet).add({
            onData: () => ({ close: async () => {} }),
            close: async () => {},
            supports: (type: ChannelType) => type === ChannelType.BLE,
            openChannel: async () => channel,
        });

        const error = await MockTime.resolve(
            controller.env
                .get(ControllerCommissioner)
                .commission({
                    fabric,
                    passcode: 20202021,
                    addresses: [{ type: "ble", peripheralAddress: "00:11:22:33:44:55" }],
                    timeout: Seconds(90),
                })
                .then(
                    () => undefined,
                    error => error,
                ),
            { macrotasks: true },
        );

        expect(causedBy(error, BleChannelClosedError)).true;
        expect(channel.closedAt! - channel.lostAt!).lessThan(Seconds(5));
    });
});
