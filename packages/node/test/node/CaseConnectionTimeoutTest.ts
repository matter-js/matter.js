/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import {
    Crypto,
    Duration,
    Forever,
    ImplementationError,
    Millis,
    MockCrypto,
    MockNetwork,
    Network,
    Seconds,
    Time,
} from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { ControllerCommissioner, FabricAuthority, MessageCodec, PeerSet, PeerUnreachableError } from "@matter/protocol";
import { SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";

function causeChainOf(error: unknown) {
    const chain = new Array<Error>();
    while (error instanceof Error) {
        chain.push(error);
        error = error.cause;
    }
    return chain;
}

describe("caseConnectionTimeout", () => {
    before(() => {
        MockTime.init();
    });

    async function setup(site: MockSite) {
        const { controller, device } = await site.addUncommissionedPair();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        // The device never sees the operational handshake, so the CASE connection after AddNOC cannot complete
        const deviceNetwork = device.env.get(Network) as MockNetwork;
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (packet.kind === "udp" && packet.destPort === 5540) {
                const decoded = MessageCodec.decodePacket(packet.payload);
                if (decoded.header.sessionId === 0) {
                    const { payloadHeader } = MessageCodec.decodePayload(decoded);
                    if (
                        payloadHeader.protocolId === SECURE_CHANNEL_PROTOCOL_ID &&
                        payloadHeader.messageType === SecureMessageType.Sigma1
                    ) {
                        return;
                    }
                }
            }
            route(packet);
        });

        await controller.start();
        return { controller, device };
    }

    it("fails commissioning when the budget expires and deletes the peer", async () => {
        await using site = new MockSite();
        const { controller, device } = await setup(site);
        const { passcode, discriminator } = device.state.commissioning;

        const budget = Seconds(20);
        const start = Time.nowMs;
        let caught: unknown;
        await MockTime.resolve(
            controller.peers
                .commission({ passcode, discriminator, timeout: Seconds(90), caseConnectionTimeout: budget })
                .catch(error => {
                    caught = error;
                }),
            { macrotasks: true },
        );
        const elapsed = Millis(Time.nowMs - start);

        expect(caught, "commissioning rejected").not.undefined;
        // The default budget is 255 s, so finishing well before shows the given budget applied
        expect(elapsed).lessThan(Seconds(60));
        const unreachable = causeChainOf(caught).find(error => error instanceof PeerUnreachableError);
        expect(unreachable?.message).contains(Duration.format(budget));
        expect(controller.env.get(PeerSet).size).equals(0);
    });

    it("refuses a non-finite budget", async () => {
        await using site = new MockSite();
        const { controller, device } = await setup(site);
        const { passcode } = device.state.commissioning;

        await controller.act(agent => agent.load(ControllerBehavior));
        const fabricConfig = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
        const fabric = await controller.env.get(FabricAuthority).defaultFabric(fabricConfig);

        await expect(
            controller.env.get(ControllerCommissioner).commission({
                fabric,
                passcode,
                addresses: [{ ip: "abcd::2", port: 5540 }],
                caseConnectionTimeout: Forever,
            }),
        ).rejectedWith(ImplementationError, "caseConnectionTimeout must be finite");
    });
});
