/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlClient } from "#behaviors/access-control";
import { BasicInformationClient } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/ServerNode.js";
import { ImplementationError } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { ClientInteraction, ClientSubscribe, ReadResult, Subscribe } from "@matter/protocol";
import { ClusterId, DataVersionFilter, EndpointNumber } from "@matter/types";

describe("ClientSubscribe", () => {
    before(() => {
        MockTime.init();
    });

    it("rejects a subscription that designates no attributes or events", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint },
        });

        const peer1 = controller.peers.get("peer1")!;
        const interaction = peer1.interaction as ClientInteraction;

        await expect(interaction.subscribe(Subscribe({}))).rejectedWith(
            ImplementationError,
            "at least one must be specified",
        );
    });

    describe("data version filters", () => {
        /** Subscribes once and returns the cluster IDs with attribute data in the priming report, by data version. */
        async function primingClusters(peer: ClientNode, options: Partial<ClientSubscribe>) {
            const versions = new Map<ClusterId, number>();
            const request: ClientSubscribe = {
                ...Subscribe({ attributes: [{ endpointId: EndpointNumber(0) }] }),
                ...options,
                sustain: false,
                updated: async (data: ReadResult) => {
                    for await (const chunk of data) {
                        for await (const report of chunk) {
                            if (report.kind === "attr-value") {
                                versions.set(report.path.clusterId, report.version);
                            }
                        }
                    }
                },
            };
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));
            subscription.close();
            return versions;
        }

        it("injects known data versions by default", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const clusters = await primingClusters(peer1, {});

            expect(clusters.has(BasicInformationClient.cluster.id)).false;
            expect(clusters.has(AccessControlClient.cluster.id)).false;
        });

        it("sends only the caller's data version filters with includeKnownVersions", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const all = await primingClusters(peer1, { includeKnownVersions: true });
            expect(all.has(AccessControlClient.cluster.id)).true;
            const basicVersion = all.get(BasicInformationClient.cluster.id);
            expect(basicVersion).not.undefined;

            const filters: DataVersionFilter[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: basicVersion!,
                },
            ];
            const filtered = await primingClusters(peer1, { includeKnownVersions: true, dataVersionFilters: filters });

            expect(filtered.has(BasicInformationClient.cluster.id)).false;
            expect(filtered.has(AccessControlClient.cluster.id)).true;
            expect(filters.length).equals(1);
        });

        it("does not modify the caller's data version filters when injecting known versions", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const filters: DataVersionFilter[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: 0,
                },
            ];
            await primingClusters(peer1, { dataVersionFilters: filters });

            expect(filters).deep.equals([
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: 0,
                },
            ]);
        });
    });
});
