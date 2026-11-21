/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterController } from "#MatterController.js";
import { ChannelType, ImplementationError, Millis, TransportSet } from "@matter/general";
import { CertificateAuthority, DiscoveryData, PeerAddress, SessionParameters } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

class Captured extends Error {}

describe("MatterController commission", () => {
    before(() => {
        MockTime.init();
    });

    type Finalize = (
        address: PeerAddress,
        discoveryData?: DiscoveryData,
        sessionParameters?: Partial<SessionParameters>,
    ) => Promise<void>;

    /**
     * Runs commission() on a PASE-only controller up to the point where the finalize hook is handed to the node and
     * returns the hook together with what the legacy callback receives.
     */
    async function wrapper(site: LegacyControllerSite, knownAddress = false, abort?: AbortSignal) {
        const source = await site.addController();
        const environment = site.addEnvironment();
        // Commissioning is stubbed, so a transport that merely claims BLE satisfies the network check
        environment.get(TransportSet).add({
            onData: () => ({ close: async () => {} }),
            close: async () => {},
            supports: (type: ChannelType) => type === ChannelType.BLE,
            openChannel: async () => {
                throw new ImplementationError("unused");
            },
        });
        const controller = await MatterController.createAsPaseCommissioner({
            id: "pase",
            environment,
            certificateAuthorityConfig: source.node.env.get(CertificateAuthority).config,
            fabricConfig: source.fabric.config,
            adminFabricLabel: "legacy test",
        });

        let finalize: Finalize | undefined;
        let capturedAbort: AbortSignal | undefined;
        const commission = (options: { finalizeCommissioning?: Finalize; abort?: AbortSignal }): never => {
            finalize = options.finalizeCommissioning;
            capturedAbort = options.abort;
            throw new Captured();
        };
        const address = { type: "udp", ip: "::1", port: 5540 } as const;
        if (knownAddress) {
            const node = await controller.node.peers.forDescriptor({ addresses: [address] });
            Object.assign(node, { commission });
            Object.assign(controller.node.peers, { forDescriptor: async () => node });
        } else {
            Object.assign(controller.node.peers, { commission });
        }

        const received = new Array<DiscoveryData | undefined>();
        const commissioning = { abort, regulatoryCountryCode: "XX" };
        await controller
            .commission(
                {
                    discovery: { identifierData: {}, knownAddress: knownAddress ? address : undefined },
                    commissioning,
                    passcode: 20202021,
                },
                {
                    completeCommissioningCallback: async (_nodeId, discoveryData) => {
                        received.push(discoveryData);
                        return true;
                    },
                },
            )
            .then(
                () => expect.fail("commission() did not reach the node"),
                error => {
                    if (!(error instanceof Captured)) {
                        throw error;
                    }
                },
            );

        const peerAddress = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5) });
        return { finalize: finalize!, received, address: peerAddress, controller, capturedAbort };
    }

    for (const knownAddress of [false, true]) {
        it(`forwards caller cancellation with ${knownAddress ? "a known address" : "discovery"}`, async () => {
            await using site = new LegacyControllerSite();
            const abort = new AbortController();
            const { controller, capturedAbort } = await wrapper(site, knownAddress, abort.signal);
            expect(capturedAbort).equals(abort.signal);
            await controller.close();
        });
    }

    it("hands the PASE-reported intervals to the legacy callback", async () => {
        await using site = new LegacyControllerSite();
        const { finalize, received, address, controller } = await wrapper(site);

        await finalize(
            address,
            { SII: Millis(500), SAI: Millis(300), SAT: Millis(4000), D: 3840 },
            { idleInterval: Millis(1234), activeInterval: Millis(321), activeThreshold: Millis(2222) },
        );

        expect(received[0]).deep.equals({
            SII: 1234,
            SAI: 321,
            SAT: 2222,
            D: 3840,
        });
        await controller.close();
    });

    it("keeps advertised intervals the PASE session did not report", async () => {
        await using site = new LegacyControllerSite();
        const { finalize, received, address, controller } = await wrapper(site);

        await finalize(
            address,
            { SII: Millis(500), SAI: Millis(300), SAT: Millis(4000) },
            { idleInterval: Millis(1234) },
        );
        await finalize(address, { SII: Millis(500) }, undefined);

        expect(received[0]).deep.include({ SII: 1234, SAI: 300, SAT: 4000 });
        expect(received[1]).deep.include({ SII: 500 });
        await controller.close();
    });
});
