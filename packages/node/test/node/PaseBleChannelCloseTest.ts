/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Bytes,
    causedBy,
    Channel,
    ChannelType,
    Crypto,
    MockCrypto,
    Seconds,
    Time,
    Transport,
    TransportSet,
} from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    BleChannel,
    BleChannelClosedError,
    ControllerCommissioner,
    FabricAuthority,
    NodeSession,
    SessionManager,
} from "@matter/protocol";

/**
 * A peripheral that accepts the first PASE message, never answers and then loses the link.  Releasing the link takes
 * one second.
 */
class SilentBleChannel extends BleChannel<Bytes> {
    readonly name = "ble://silent";
    lostAt?: number;
    closedAt?: number;
    released = false;

    async send() {
        if (this.lostAt === undefined) {
            this.lostAt = Time.nowMs;
            this.emitClosed();
        }
    }

    async close() {
        this.closedAt ??= Time.nowMs;
        this.emitClosed();
        await Time.sleep("BLE release", Seconds(1));
        this.released = true;
    }

    onClose(): Transport.Listener {
        return { close: async () => {} };
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return { next: () => new Promise(() => {}) };
    }
}

/**
 * Presents a TCP channel to a mock device as BLE, so a complete PASE runs over a channel the test can declare lost.
 * Both are reliable, so neither side waits for MRP acknowledgements.  Replies arrive through the TCP interface;
 * sessions route them by node ID, not by channel.
 */
class ForwardingBleChannel extends BleChannel<Bytes> {
    readonly name = "ble://forwarding";

    constructor(readonly tcp: Channel<Bytes>) {
        super();
    }

    async send(data: Bytes) {
        const onNextSend = this.#onNextSend;
        if (onNextSend !== undefined) {
            this.#onNextSend = undefined;
            onNextSend();
            return;
        }
        await this.tcp.send(data);
    }

    #onNextSend?: () => void;

    loseLink() {
        this.emitClosed();
    }

    /** Drops the next outgoing message and loses the link, then calls {@link onLost}. */
    loseLinkOnNextSend(onLost: () => void) {
        this.#onNextSend = () => {
            this.loseLink();
            onLost();
        };
    }

    async close() {
        this.emitClosed();
        await this.tcp.close();
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

    it("ends the PASE session as soon as its BLE channel closes and fails after the channel is released", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        await controller.start();
        await controller.act(agent => agent.load(ControllerBehavior));
        const fabricConfig = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
        const fabric = await controller.env.get(FabricAuthority).defaultFabric(fabricConfig);

        const channel = new SilentBleChannel();
        let releasedAtFailure: boolean | undefined;
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
                    error => {
                        releasedAtFailure = channel.released;
                        return error;
                    },
                ),
            { macrotasks: true },
        );

        expect(causedBy(error, BleChannelClosedError)).true;
        expect(channel.closedAt! - channel.lostAt!).lessThan(Seconds(5));
        expect(releasedAtFailure).true;
    });

    it("does not use a PASE session whose BLE channel closed while the session was created", async () => {
        await using site = new MockSite();
        let paseSession: NodeSession | undefined;

        const error = await MockTime.resolve(
            commissionOverForwardingBle(site, (session, channel) => {
                paseSession = session;
                channel.loseLink();
            }),
            { macrotasks: true },
        );

        expect(paseSession).not.undefined;
        expect(causedBy(error, BleChannelClosedError)).true;
    });

    it("closes the PASE session when its BLE channel closes during the commissioning flow", async () => {
        await using site = new MockSite();
        let paseSession: NodeSession | undefined;
        let markLost!: () => void;
        const lost = new Promise<void>(resolve => (markLost = resolve));

        const commissioning = commissionOverForwardingBle(site, (session, channel) => {
            paseSession = session;
            channel.loseLinkOnNextSend(markLost);
        });
        await MockTime.resolve(lost, { macrotasks: true });

        expect(paseSession!.isClosing).true;
        expect(causedBy(await MockTime.resolve(commissioning, { macrotasks: true }), BleChannelClosedError)).true;
    });
});

/**
 * Commissions a mock device over a {@link ForwardingBleChannel}.  {@link onPaseSession} runs when the PASE session is
 * established, before the commissioner returns it.
 *
 * @returns the error commissioning failed with, or `undefined`
 */
async function commissionOverForwardingBle(
    site: MockSite,
    onPaseSession: (session: NodeSession, channel: ForwardingBleChannel) => void,
) {
    const deviceIndex = 9;
    const controller = await site.addController({ network: { tcp: true } });
    const device = await site.addDevice({ index: deviceIndex, network: { tcp: true } });
    await controller.start();
    enableEntropy(controller, device);
    await controller.act(agent => agent.load(ControllerBehavior));
    const fabricConfig = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
    const fabric = await controller.env.get(FabricAuthority).defaultFabric(fabricConfig);

    const transports = controller.env.get(TransportSet);
    const tcp = transports.interfaceFor(ChannelType.TCP)!;
    let channel: ForwardingBleChannel | undefined;
    transports.add({
        onData: () => ({ close: async () => {} }),
        close: async () => {},
        supports: (type: ChannelType) => type === ChannelType.BLE,
        openChannel: async () =>
            (channel = new ForwardingBleChannel(
                await tcp.openChannel({
                    type: "tcp",
                    ip: `10.10.10.${deviceIndex}`,
                    port: device.state.network.operationalPort,
                }),
            )),
    });

    controller.env.get(SessionManager).sessions.added.on(session => {
        if (session.isPase && channel !== undefined) {
            onPaseSession(session, channel);
        }
    });

    return await controller.env
        .get(ControllerCommissioner)
        .commission({
            fabric,
            passcode: device.state.commissioning.passcode,
            addresses: [{ type: "ble", peripheralAddress: "00:11:22:33:44:55" }],
            timeout: Seconds(90),
        })
        .then(
            () => undefined,
            error => error,
        );
}

function enableEntropy(controller: ServerNode, device: ServerNode) {
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;
}
