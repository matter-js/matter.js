/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { SubscriptionsServer } from "#behavior/system/subscriptions/SubscriptionsServer.js";
import { AccessControlClient } from "#behaviors/access-control";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerNode } from "#node/ServerNode.js";
import { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import {
    AbortedError,
    Diagnostic,
    ImplementationError,
    Lifecycle,
    LogDestination,
    Logger,
    LogLevel,
    MatterError,
    MockNetwork,
    MockRouter,
    Network,
    Seconds,
} from "@matter/general";
import { clientStructureOf, MockSite, settled, subscribedPeer } from "@matter/node/testing";
import {
    ClientInteraction,
    ClientRead,
    ClientSubscribe,
    ClientSubscription,
    PeerSet,
    Read,
    SessionManager,
    ReadResult,
    Subscribe,
    SustainedSubscription,
} from "@matter/protocol";
import { AttributeId, ClusterId, DataVersionFilter, EndpointNumber, TlvAny } from "@matter/types";

class StorageRefusedError extends MatterError {}
class SubscribeRefusedError extends MatterError {}

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
        const rootAttributes = Subscribe({ attributes: [{ endpointId: EndpointNumber(0) }], keepSubscriptions: true });

        /** Collects the data version of each cluster with attribute data in {@link data}. */
        async function clustersOf(data: ReadResult, clusters: Map<ClusterId, number>) {
            for await (const chunk of data) {
                for await (const report of chunk) {
                    if (report.kind === "attr-value") {
                        clusters.set(report.path.clusterId, report.version);
                    }
                }
            }
        }

        /** Subscribes once and returns the clusters with attribute data in the priming report. */
        async function primingClusters(peer: ClientNode, options: Partial<ClientSubscribe>) {
            const clusters = new Map<ClusterId, number>();
            const request: ClientSubscribe = {
                ...rootAttributes,
                ...options,
                sustain: false,
                updated: data => clustersOf(data, clusters),
            };
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));
            subscription.close();
            return clusters;
        }

        /**
         * Runs a sustained subscription through one loss of its peer and returns the clusters in the priming report
         * of the replacement subscription.
         */
        async function resubscribedClusters(
            site: MockSite,
            options: Partial<ClientSubscribe>,
        ): Promise<Map<ClusterId, number>> {
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");

            let clusters = new Map<ClusterId, number>();
            const request: ClientSubscribe = {
                ...rootAttributes,
                ...options,
                sustain: true,
                updated: data => clustersOf(data, clusters),
            };
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));
            if (!(subscription instanceof SustainedSubscription)) {
                expect.fail("Expected a sustained subscription");
            }
            await MockTime.resolve(subscription.active);

            await MockTime.resolve(device.stop());
            await MockTime.resolve(subscription.inactive);
            clusters = new Map();
            await MockTime.resolve(device.start());
            await MockTime.resolve(subscription.active);
            subscription.close();

            return clusters;
        }

        async function readClusters(peer: ClientNode, options: Partial<ClientRead>) {
            const clusters = new Map<ClusterId, number>();
            const request: ClientRead = { ...Read({ attributes: [{ endpointId: EndpointNumber(0) }] }), ...options };
            await MockTime.resolve(
                (async () => {
                    for await (const chunk of peer.interaction.read(request)) {
                        for await (const report of chunk) {
                            if (report.kind === "attr-value") {
                                clusters.set(report.path.clusterId, report.version);
                            }
                        }
                    }
                })(),
            );
            return clusters;
        }

        it("injects known data versions into a read by default", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const clusters = await readClusters(peer1, {});

            expect(clusters.has(BasicInformationClient.cluster.id)).false;
        });

        it("injects no data versions into a read with includeKnownVersions", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const clusters = await readClusters(peer1, { includeKnownVersions: true });

            expect(clusters.has(BasicInformationClient.cluster.id)).true;
        });

        it("keeps the caller's data version filters and injects none for their clusters", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const unknownCluster = {
                path: { endpointId: EndpointNumber(99), clusterId: ClusterId(0x1234) },
                dataVersion: 5,
            };
            const knownCluster = {
                path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                dataVersion: 5,
            };
            const callerFilters = [unknownCluster, knownCluster];
            const request = { ...Read({ attributes: [{}] }), dataVersionFilters: callerFilters };

            const injected = clientStructureOf(peer1).injectVersionFilters(request).dataVersionFilters ?? [];

            expect(injected.slice(0, 2)).deep.equals([unknownCluster, knownCluster]);
            expect(
                injected.filter(({ path: { clusterId } }) => clusterId === BasicInformationClient.cluster.id),
            ).deep.equals([knownCluster]);
            expect(injected.some(({ path: { clusterId } }) => clusterId === AccessControlClient.cluster.id)).true;
            expect(callerFilters).deep.equals([unknownCluster, knownCluster]);
        });

        it("lets a caller's data version filter win over the cached version", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const staleFilter: DataVersionFilter[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: 0,
                },
            ];

            const read = await readClusters(peer1, { dataVersionFilters: staleFilter });
            const primed = await primingClusters(peer1, { dataVersionFilters: staleFilter });

            expect(read.has(BasicInformationClient.cluster.id)).true;
            expect(primed.has(BasicInformationClient.cluster.id)).true;
        });

        it("lets a caller's data version filter win when a sustained subscription replaces a lost one", async () => {
            await using site = new MockSite();
            const staleFilter: DataVersionFilter[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: 0,
                },
            ];

            const clusters = await resubscribedClusters(site, { dataVersionFilters: staleFilter });

            expect(clusters.has(BasicInformationClient.cluster.id)).true;
        });

        it("injects known data versions by default", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const clusters = await primingClusters(peer1, {});

            expect(clusters.has(BasicInformationClient.cluster.id)).false;
        });

        it("sends only the caller's data version filters with includeKnownVersions", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const all = await primingClusters(peer1, { includeKnownVersions: true });
            expect(all.has(BasicInformationClient.cluster.id)).true;
            expect(all.has(AccessControlClient.cluster.id)).true;

            const filters: DataVersionFilter[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id },
                    dataVersion: all.get(BasicInformationClient.cluster.id)!,
                },
            ];
            const filtered = await primingClusters(peer1, { includeKnownVersions: true, dataVersionFilters: filters });

            expect(filtered.has(BasicInformationClient.cluster.id)).false;
            expect(filtered.has(AccessControlClient.cluster.id)).true;
        });

        it("does not modify the caller's data version filters when injecting known versions", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const filter = {
                path: { endpointId: EndpointNumber(99), clusterId: ClusterId(0x1234) },
                dataVersion: 0,
            };
            const filters: DataVersionFilter[] = [filter];
            const clusters = await primingClusters(peer1, { dataVersionFilters: filters });

            expect(clusters.has(BasicInformationClient.cluster.id)).false;
            expect(filters).deep.equals([filter]);
        });

        it("injects no data versions into a subscription with the other fabric filter", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const clusters = await primingClusters(peer1, { isFabricFiltered: false });

            expect(clusters.has(BasicInformationClient.cluster.id)).true;
        });

        it("sends no data version filters with an unfiltered subscription while the cache is fabric filtered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            expect(clientStructureOf(peer1).cacheFabricFiltered).true;

            const sent = new Array<ClientSubscribe>();
            const { subscribe } = ClientInteraction.prototype;
            ClientInteraction.prototype.subscribe = function (request, session) {
                sent.push(request);
                return subscribe.bind(this)(request, session);
            };
            try {
                for (const fabricFilter of [true, false]) {
                    const request: ClientSubscribe = {
                        ...Subscribe({ attributes: [{ endpointId: EndpointNumber(0) }], fabricFilter }),
                        sustain: false,
                    };
                    const subscription = await MockTime.resolve(peer1.interaction.subscribe(request));
                    subscription.close();
                }
            } finally {
                ClientInteraction.prototype.subscribe = subscribe;
            }

            const [filtered, unfiltered] = sent;
            expect(filtered.isFabricFiltered).true;
            expect(filtered.dataVersionFilters?.length).greaterThan(0);
            expect(unfiltered.isFabricFiltered).false;
            expect(unfiltered.dataVersionFilters ?? []).deep.equals([]);
        });

        it("injects known data versions when a sustained subscription replaces a lost one", async () => {
            await using site = new MockSite();

            const clusters = await resubscribedClusters(site, {});

            expect(clusters.has(BasicInformationClient.cluster.id)).false;
        });

        it("applies the caller's refreshRequest to the caller's filters when replacing a lost subscription", async () => {
            await using site = new MockSite();
            const refreshed = new Array<DataVersionFilter[] | undefined>();

            const clusters = await resubscribedClusters(site, {
                refreshRequest: request => {
                    refreshed.push(request.dataVersionFilters);
                    return request;
                },
            });

            expect(refreshed.length).greaterThan(0);
            expect(refreshed.every(filters => filters === undefined)).true;
            expect(clusters.has(BasicInformationClient.cluster.id)).false;
        });

        it("keeps includeKnownVersions when a sustained subscription replaces a lost one", async () => {
            await using site = new MockSite();

            const clusters = await resubscribedClusters(site, { includeKnownVersions: true });

            expect(clusters.has(BasicInformationClient.cluster.id)).true;
        });
    });

    describe("cache fabric filter", () => {
        /** The clusters of endpoint 0 a read with {@link fabricFilter} would get data version filters for. */
        function filteredClusters(peer: ClientNode, fabricFilter: boolean) {
            const request = Read({ attributes: [{ endpointId: EndpointNumber(0) }], fabricFilter });
            return (clientStructureOf(peer).injectVersionFilters(request).dataVersionFilters ?? []).map(
                ({ path: { clusterId } }) => clusterId,
            );
        }

        async function restartedPeer(site: MockSite, controllerId: string) {
            await site.close();
            const controller = await site.addNode(undefined, { id: controllerId, index: 1 });
            await MockTime.resolve(controller.start(), { macrotasks: true });
            return controller.peers.get("peer1")!;
        }

        /** Advances mock time until the nodes have no activity in flight. */
        async function settle(...nodes: Parameters<typeof settled>) {
            await MockTime.resolve(settled(...nodes), { macrotasks: true });
        }

        function defaultSubscriptionOf(peer: ClientNode) {
            const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
            if (!(subscription instanceof SustainedSubscription)) {
                expect.fail("Expected a sustained default subscription");
            }
            return subscription;
        }

        it("follows the fabric filter the default subscription sends", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");

            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await settle(controller, device, peer);
            const subscription = defaultSubscriptionOf(peer);
            await MockTime.resolve(subscription.active);

            expect(subscription.request.isFabricFiltered).false;
            expect(clientStructureOf(peer).cacheFabricFiltered).false;

            const relabeled = new Promise<void>(resolve =>
                peer.eventsOf(BasicInformationClient).nodeLabel$Changed.once(() => resolve()),
            );
            await MockTime.resolve(device.set({ basicInformation: { nodeLabel: "relabeled" } }));
            await MockTime.resolve(relabeled, { macrotasks: true });
            expect(peer.stateOf(BasicInformationClient).nodeLabel).equals("relabeled");
        });

        it("sends a default subscription given as a built request as it is", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const paths = [{ endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id }];

            await MockTime.resolve(
                peer.set({ network: { defaultSubscription: Read({ attributes: paths, fabricFilter: false }) } }),
            );
            await settle(controller, peer);
            const subscription = defaultSubscriptionOf(peer);
            await MockTime.resolve(subscription.active);

            expect(subscription.request.attributeRequests).deep.equals(paths);
            expect(subscription.request.isFabricFiltered).false;
            expect(clientStructureOf(peer).cacheFabricFiltered).false;
        });

        it("forgets data versions when the default subscription's fabric filter changes", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            expect(filteredClusters(peer, true)).include(BasicInformationClient.cluster.id);

            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await settle(controller, peer);

            expect(filteredClusters(peer, false)).deep.equals([]);
            expect(peer.env.get(ClientNodeStore).cacheFabricFiltered).false;
            expect(peer.stateOf(BasicInformationClient).vendorId).equals(0xfff1);
        });

        it("forgets a version known only to storage when the fabric filter changes", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const onOffOf = (node: ClientNode, fabricFilter: boolean) =>
                clientStructureOf(node).injectVersionFilters(
                    Read({
                        attributes: [{ endpointId: EndpointNumber(1), clusterId: OnOffClient.cluster.id }],
                        fabricFilter,
                    }),
                ).dataVersionFilters ?? [];
            expect(onOffOf(peer, true).length).equals(1);

            // As loading a cluster with unlisted values does, which leaves the stored version in place
            clientStructureOf(peer).storeForRemote(peer.parts.get("ep1")!, OnOffClient).invalidateVersion?.();
            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await settle(controller, peer);
            const restarted = await restartedPeer(site, controller.id);

            expect(onOffOf(restarted, false)).deep.equals([]);
        });

        it("forgets data versions cached under another fabric filter on restart", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await MockTime.resolve(peer.env.get(ClientNodeStore).recordCacheFabricFiltered(false));

            const restarted = await restartedPeer(site, controller.id);

            expect(filteredClusters(restarted, true)).deep.equals([]);
            expect(restarted.env.get(ClientNodeStore).cacheFabricFiltered).true;
            expect(restarted.stateOf(BasicInformationClient).vendorId).equals(0xfff1);
        });

        it("keeps forgotten data versions unknown across a restart", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await settle(controller, peer);

            // The switch completed before the restart, so the restart finds the new filter recorded and forgets nothing
            expect(peer.env.get(ClientNodeStore).cacheFabricFiltered).false;
            const restarted = await restartedPeer(site, controller.id);

            expect(restarted.env.get(ClientNodeStore).cacheFabricFiltered).false;
            expect(filteredClusters(restarted, false)).deep.equals([]);
        });

        it("keeps data versions on restart with an unchanged fabric filter", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const before = filteredClusters(peer, true);
            expect(before).include(BasicInformationClient.cluster.id);

            const restarted = await restartedPeer(site, controller.id);

            expect(filteredClusters(restarted, true)).to.have.members(before);
        });

        it("keeps data versions of a node stored without a fabric filter record and records the filter", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const before = filteredClusters(peer, true);
            const storage = site.storageFor(controller.id);
            const recordKey = `nodes.${peer.id}.cache`;
            expect(storage[recordKey]).not.undefined;
            delete storage[recordKey];

            const restarted = await restartedPeer(site, controller.id);

            expect(filteredClusters(restarted, true)).to.have.members(before);
            expect(restarted.env.get(ClientNodeStore).cacheFabricFiltered).true;
        });

        it("applies reports of a sustained subscription by the fabric filter its refreshRequest returned", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const onOff = { endpointId: EndpointNumber(1), clusterId: OnOffClient.cluster.id };

            let reportedOn!: () => void;
            const reported = new Promise<void>(resolve => (reportedOn = resolve));
            const request: ClientSubscribe = {
                ...Subscribe({ attributes: [onOff], fabricFilter: false }),
                sustain: true,
                bootstrapWithRead: true,
                refreshRequest: previous => ({ ...previous, isFabricFiltered: true }),
                updated: async data => {
                    for await (const chunk of data) {
                        for await (const report of chunk) {
                            if (report.kind === "attr-value" && report.value === true) {
                                reportedOn();
                            }
                        }
                    }
                },
            };
            const subscription = await MockTime.resolve(peer.interaction.subscribe(request));
            if (!(subscription instanceof SustainedSubscription)) {
                expect.fail("Expected a sustained subscription");
            }
            await MockTime.resolve(subscription.active);
            expect(peer.parts.get("ep1")!.stateOf(OnOffClient).onOff).false;

            await MockTime.resolve(device.parts.get(1)!.setStateOf(OnOffServer, { onOff: true }));
            await MockTime.resolve(reported, { macrotasks: true });
            await settle(controller, device, peer);
            subscription.close();

            expect(peer.parts.get("ep1")!.stateOf(OnOffClient).onOff).true;
        });

        it("applies data of an interaction that started before a switch to unfiltered without its version", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const structure = clientStructureOf(peer);
            const onOff = { endpointId: EndpointNumber(1), clusterId: OnOffClient.cluster.id };

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            async function* oldFilterReport(): ReadResult {
                yield [
                    {
                        kind: "attr-value",
                        path: { ...onOff, attributeId: AttributeId(OnOffClient.cluster.attributes.onOff.id) },
                        value: true,
                        version: 77,
                        tlv: TlvAny,
                    },
                ];
                await released;
            }
            // The report's data passes the cache check before the switch starts and would be applied after it
            const report = structure.mutate(Read({ attributes: [{}] }), oldFilterReport())[Symbol.asyncIterator]();
            await MockTime.resolve(report.next());
            const reporting = (async () => {
                while (!(await report.next()).done);
            })();

            await MockTime.resolve(structure.adoptFabricFilter(false));
            release();
            await MockTime.resolve(reporting);

            const filters = structure.injectVersionFilters(Read({ attributes: [onOff], fabricFilter: false }));
            expect(filters.dataVersionFilters ?? []).deep.equals([]);
            expect(peer.parts.get("ep1")!.stateOf(OnOffClient).onOff).true;
        });

        it("applies data of an interaction that started before a switch to filtered without its version", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const structure = clientStructureOf(peer);
            await MockTime.resolve(structure.adoptFabricFilter(false));
            const onOff = { endpointId: EndpointNumber(1), clusterId: OnOffClient.cluster.id };

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            async function* reportAcrossSwitch(): ReadResult {
                yield [];
                await released;
                yield [
                    {
                        kind: "attr-value",
                        path: { ...onOff, attributeId: AttributeId(OnOffClient.cluster.attributes.onOff.id) },
                        value: true,
                        version: 78,
                        tlv: TlvAny,
                    },
                ];
            }
            // The interaction starts before the switch; its data arrives after it, under the filter it switched to
            const report = structure.mutate(Read({ attributes: [{}] }), reportAcrossSwitch())[Symbol.asyncIterator]();
            await MockTime.resolve(report.next());
            const reporting = (async () => {
                while (!(await report.next()).done);
            })();

            await MockTime.resolve(structure.adoptFabricFilter(true));
            release();
            await MockTime.resolve(reporting);

            const filters = structure.injectVersionFilters(Read({ attributes: [onOff] }));
            expect(filters.dataVersionFilters ?? []).deep.equals([]);
            expect(peer.parts.get("ep1")!.stateOf(OnOffClient).onOff).true;
        });

        describe("when storage refuses to record the fabric filter", () => {
            async function refusingRecord<T>(action: () => Promise<T>) {
                const record = ClientNodeStore.prototype.recordCacheFabricFiltered;
                ClientNodeStore.prototype.recordCacheFabricFiltered = async () => {
                    throw new StorageRefusedError("storage refused");
                };
                const warnings = new Array<string>();
                const errors = new Array<string>();
                Logger.destinations.capture = LogDestination({
                    add(message: Diagnostic.Message) {
                        if (message.facility !== "NetworkClient") {
                            return;
                        }
                        if (message.level === LogLevel.WARN) {
                            warnings.push(message.values.join(" "));
                        } else if (message.level === LogLevel.ERROR) {
                            errors.push(message.values.join(" "));
                        }
                    },
                });
                try {
                    return { result: await action(), warnings, errors };
                } finally {
                    ClientNodeStore.prototype.recordCacheFabricFiltered = record;
                    delete Logger.destinations.capture;
                }
            }

            it("warns and keeps the cache usable when the first record cannot be written", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
                const before = filteredClusters(peer, true);
                delete site.storageFor(controller.id)[`nodes.${peer.id}.cache`];

                const {
                    result: restarted,
                    warnings,
                    errors,
                } = await refusingRecord(() => restartedPeer(site, controller.id));

                expect(warnings.length).equals(1);
                expect(errors).deep.equals([]);
                expect(restarted.env.get(ClientNodeStore).cacheFabricFiltered).undefined;
                expect(clientStructureOf(restarted).cacheFabricFiltered).true;
                expect(filteredClusters(restarted, true)).to.have.members(before);
            });

            it("records no version for data of an interaction that started before the first record of another filter", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
                delete site.storageFor(controller.id)[`nodes.${peer.id}.cache`];
                const { result: restarted } = await refusingRecord(() => restartedPeer(site, controller.id));
                expect(restarted.env.get(ClientNodeStore).cacheFabricFiltered).undefined;
                const structure = clientStructureOf(restarted);
                const onOff = { endpointId: EndpointNumber(1), clusterId: OnOffClient.cluster.id };

                let release!: () => void;
                const released = new Promise<void>(resolve => (release = resolve));
                async function* reportAcrossRecord(): ReadResult {
                    yield [];
                    await released;
                    yield [
                        {
                            kind: "attr-value",
                            path: { ...onOff, attributeId: AttributeId(OnOffClient.cluster.attributes.onOff.id) },
                            value: true,
                            version: 79,
                            tlv: TlvAny,
                        },
                    ];
                }
                // The interaction starts while the cache has no record; its data arrives after the unfiltered record
                const report = structure
                    .mutate(Read({ attributes: [{}], fabricFilter: false }), reportAcrossRecord())
                    [Symbol.asyncIterator]();
                await MockTime.resolve(report.next());
                const reporting = (async () => {
                    while (!(await report.next()).done);
                })();

                await MockTime.resolve(structure.adoptFabricFilter(false));
                release();
                await MockTime.resolve(reporting);

                const filters = structure.injectVersionFilters(Read({ attributes: [onOff], fabricFilter: false }));
                expect(filters.dataVersionFilters ?? []).deep.equals([]);
                expect(restarted.parts.get("ep1")!.stateOf(OnOffClient).onOff).true;
            });

            it("logs an error when the switched filter cannot be recorded", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
                await MockTime.resolve(peer.env.get(ClientNodeStore).recordCacheFabricFiltered(false));

                const {
                    result: restarted,
                    warnings,
                    errors,
                } = await refusingRecord(() => restartedPeer(site, controller.id));

                expect(errors.length).equals(1);
                expect(warnings).deep.equals([]);
                expect(clientStructureOf(restarted).cacheFabricFiltered).false;
            });
        });

        describe("when storage refuses to forget a version", () => {
            async function refusingStorage<T>(action: () => Promise<T>) {
                const forgetVersion = DatasourceCache.prototype.forgetVersion;
                DatasourceCache.prototype.forgetVersion = async () => {
                    throw new StorageRefusedError("storage refused");
                };
                const errors = new Array<string>();
                Logger.destinations.capture = LogDestination({
                    add(message: Diagnostic.Message) {
                        if (message.level === LogLevel.ERROR && message.facility === "NetworkClient") {
                            errors.push(message.values.join(" "));
                        }
                    },
                });
                try {
                    return { result: await action(), errors };
                } finally {
                    DatasourceCache.prototype.forgetVersion = forgetVersion;
                    delete Logger.destinations.capture;
                }
            }

            it("keeps the old filter and still subscribes after a runtime change", async () => {
                await using site = new MockSite();
                const { controller, device } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");

                const { errors } = await refusingStorage(async () => {
                    await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
                    await settle(controller, device, peer);
                });

                expect(errors.length).equals(1);
                expect(clientStructureOf(peer).cacheFabricFiltered).true;
                const subscription = defaultSubscriptionOf(peer);
                await MockTime.resolve(subscription.active);
                expect(subscription.request.isFabricFiltered).false;

                await MockTime.resolve(device.set({ basicInformation: { nodeLabel: "relabeled" } }));
                const read: ClientRead = {
                    ...Read({ attributes: [{ endpointId: EndpointNumber(0) }] }),
                    includeKnownVersions: true,
                };
                await MockTime.resolve(
                    (async () => {
                        for await (const _chunk of peer.interaction.read(read));
                    })(),
                );
                expect(peer.stateOf(BasicInformationClient).nodeLabel).equals("relabeled");
            });

            it("keeps the old filter and still starts the node", async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = await subscribedPeer(controller, "peer1");
                await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
                await MockTime.resolve(peer.env.get(ClientNodeStore).recordCacheFabricFiltered(false));

                const { result: restarted, errors } = await refusingStorage(() => restartedPeer(site, controller.id));

                expect(errors.length).equals(1);
                expect(restarted.construction.status).equals(Lifecycle.Status.Active);
                expect(clientStructureOf(restarted).cacheFabricFiltered).false;
            });
        });
    });

    describe("default subscription ownership", () => {
        async function settle(...nodes: Parameters<typeof settled>) {
            await MockTime.resolve(settled(...nodes), { macrotasks: true });
        }

        function sustained(subscription: unknown) {
            if (!(subscription instanceof SustainedSubscription)) {
                expect.fail("Expected a sustained subscription");
            }
            return subscription;
        }

        /** Advances mock time by {@link count} macrotasks. */
        async function turns(count: number) {
            await MockTime.resolve(
                (async () => {
                    for (let turn = 0; turn < count; turn++) {
                        await MockTime.macrotask;
                    }
                })(),
                { macrotasks: true },
            );
        }

        /** Intercepts the subscriptions the node's interaction creates; {@link around} runs around each. */
        function interceptSubscribe(
            around: (
                subscribe: () => Promise<ClientSubscription>,
                request: ClientSubscribe,
                call: number,
            ) => Promise<ClientSubscription>,
        ) {
            const original = ClientNodeInteraction.prototype.subscribe;
            const created = new Array<ClientSubscription>();
            let calls = 0;
            ClientNodeInteraction.prototype.subscribe = async function (request, context) {
                const subscription = await around(() => original.call(this, request, context), request, calls++);
                created.push(subscription);
                return subscription;
            };
            return {
                created,
                [Symbol.dispose]() {
                    ClientNodeInteraction.prototype.subscribe = original;
                },
            };
        }

        it("ignores callbacks of a replaced default subscription", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const replaced = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);

            await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
            await settle(controller, device, peer);
            const successor = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
            expect(successor).not.equals(replaced);

            let alive = 0;
            const statuses = new Array<boolean>();
            peer.eventsOf(NetworkClient).subscriptionAlive.on(() => {
                alive++;
            });
            peer.eventsOf(NetworkClient).subscriptionStatusChanged.on(status => {
                statuses.push(status);
            });

            async function* emptyReport(): ReadResult {
                yield [];
            }
            await MockTime.resolve(replaced.request.updated!(emptyReport()));
            replaced.request.keepaliveReceived?.();
            replaced.request.closed?.();
            await MockTime.resolve(replaced.active.emit(true));

            expect(alive).equals(0);
            expect(statuses).deep.equals([]);
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(successor);
        });

        it("does not install a default subscription that closed while it was established", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await settle(controller, device, peer);
            const statuses = new Array<boolean>();
            peer.eventsOf(NetworkClient).subscriptionStatusChanged.on(status => {
                statuses.push(status);
            });

            {
                using intercept = interceptSubscribe(async (subscribe, request) => {
                    const subscription = await subscribe();
                    request.closed?.();
                    return subscription;
                });
                await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
                await settle(controller, device, peer);
                await MockTime.resolve(sustained(intercept.created[0]).done);
            }
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).undefined;
            expect(statuses).deep.equals([]);

            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
            await settle(controller, device, peer);
            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);
            await MockTime.resolve(subscription.active);
        });

        it("subscribes at the next start after a default subscription failed to start", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await settle(controller, device, peer);

            {
                using _intercept = interceptSubscribe(async () => {
                    throw new SubscribeRefusedError("subscribe refused");
                });
                await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
                await settle(controller, device, peer);
            }
            expect(peer.behaviors.internalsOf(NetworkClient).subscriptionOwner).undefined;

            await MockTime.resolve(peer.stop(), { macrotasks: true });
            await MockTime.resolve(peer.start(), { macrotasks: true });
            await settle(controller, device, peer);

            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);
            await MockTime.resolve(subscription.active);
        });

        it("runs startup and the reaction to defaultSubscription one at a time", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.stop(), { macrotasks: true });

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            const sent = new Array<boolean | undefined>();
            {
                // Startup holds its subscribe until released
                using intercept = interceptSubscribe(async (subscribe, request, call) => {
                    sent.push(request.isFabricFiltered);
                    const subscription = await subscribe();
                    if (call === 0) {
                        await released;
                    }
                    return subscription;
                });
                const starting = peer.start();
                await turns(100);
                expect(sent).deep.equals([true]);

                const changing = peer.set({ network: { defaultSubscription: { fabricFilter: false } } });
                await turns(100);
                expect(sent).deep.equals([true]);

                release();
                await MockTime.resolve(starting, { macrotasks: true });
                await MockTime.resolve(changing, { macrotasks: true });
                await settle(controller, device, peer);

                expect(sent).deep.equals([true, false]);
                const [, installed] = intercept.created.map(sustained);
                expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(installed);
                await MockTime.resolve(installed.active);
            }
        });

        it("runs the reactions to autoSubscribe and defaultSubscription one at a time", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            await settle(controller, device, peer);

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            const sent = new Array<boolean | undefined>();
            {
                // The first start holds its reaction until released
                using intercept = interceptSubscribe(async (subscribe, request, call) => {
                    sent.push(request.isFabricFiltered);
                    const subscription = await subscribe();
                    if (call === 0) {
                        await released;
                    }
                    return subscription;
                });
                await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
                await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
                await MockTime.resolve(
                    (async () => {
                        for (let turn = 0; turn < 100; turn++) {
                            await MockTime.macrotask;
                        }
                    })(),
                    { macrotasks: true },
                );

                expect(sent).deep.equals([true]);

                release();
                await settle(controller, device, peer);

                expect(sent).deep.equals([true, false]);
                const [superseded, installed] = intercept.created.map(sustained);
                expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(installed);
                await MockTime.resolve(superseded.done);
                await MockTime.resolve(installed.active);
            }
        });

        it("reports not subscribed when an active default subscription ends", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const subscription = sustained(peer.behaviors.internalsOf(NetworkClient).activeSubscription);
            expect(subscription.active.value).true;

            const statuses = new Array<boolean>();
            peer.eventsOf(NetworkClient).subscriptionStatusChanged.on(status => {
                statuses.push(status);
            });

            // Ends as an abort that lands before the subscription reported itself not live would
            subscription.request.closed?.();
            await settle(controller, device, peer);

            expect(statuses).deep.equals([false]);
            expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).undefined;
        });

        it("records no data version for a report of a subscription opened before a switch", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const structure = clientStructureOf(peer);
            const basicInformation = { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id };

            const request: ClientSubscribe = {
                ...Subscribe({ attributes: [basicInformation], keepSubscriptions: true }),
                sustain: true,
                includeKnownVersions: true,
            };
            const subscription = sustained(await MockTime.resolve(peer.interaction.subscribe(request)));
            await MockTime.resolve(subscription.active);

            await MockTime.resolve(structure.adoptFabricFilter(false));
            await MockTime.resolve(structure.adoptFabricFilter(true));

            const relabeled = new Promise<void>(resolve =>
                peer.eventsOf(BasicInformationClient).nodeLabel$Changed.once(() => resolve()),
            );
            await MockTime.resolve(device.set({ basicInformation: { nodeLabel: "relabeled" } }));
            await MockTime.resolve(relabeled, { macrotasks: true });
            await settle(controller, device, peer);
            subscription.close();

            expect(peer.stateOf(BasicInformationClient).nodeLabel).equals("relabeled");
            expect(structure.injectVersionFilters(Read({ attributes: [basicInformation] })).dataVersionFilters)
                .undefined;
        });

        it("records data versions again once a subscription opened before a switch is replaced", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
            const structure = clientStructureOf(peer);
            const basicInformation = { endpointId: EndpointNumber(0), clusterId: BasicInformationClient.cluster.id };

            const request: ClientSubscribe = {
                ...Subscribe({ attributes: [basicInformation], keepSubscriptions: true }),
                sustain: true,
                includeKnownVersions: true,
            };
            const subscription = sustained(await MockTime.resolve(peer.interaction.subscribe(request)));
            await MockTime.resolve(subscription.active);

            await MockTime.resolve(structure.adoptFabricFilter(false));
            await MockTime.resolve(structure.adoptFabricFilter(true));
            expect(structure.injectVersionFilters(Read({ attributes: [basicInformation] })).dataVersionFilters)
                .undefined;

            for (const session of [...device.env.get(SessionManager).sessions]) {
                await MockTime.resolve(session.initiateClose());
            }
            await MockTime.resolve(subscription.inactive);
            await MockTime.resolve(subscription.active);
            await settle(controller, device, peer);
            subscription.close();

            expect(structure.injectVersionFilters(Read({ attributes: [basicInformation] })).dataVersionFilters).not
                .undefined;
        });
    });

    describe("cancelled while being established", () => {
        /** Holds the device's unicast packets until {@link release}; mDNS passes. */
        function holdDeviceReplies(device: ServerNode) {
            const network = device.env.get(Network);
            if (!(network instanceof MockNetwork)) {
                expect.fail("device network is not simulated");
            }
            const deviceAddresses = ["abcd::2", "10.10.10.2"];
            const held = new Array<() => void>();
            let holding = true;
            network.simulator.router.intercept((packet: MockRouter.Packet, route: MockRouter.Route) => {
                if (holding && deviceAddresses.includes(packet.sourceAddress) && packet.destPort !== 5353) {
                    held.push(() => route(packet));
                    return;
                }
                route(packet);
            });
            return {
                release() {
                    holding = false;
                    for (const send of held.splice(0)) {
                        send();
                    }
                },
            };
        }

        /** Collects the device's reasons for failing to prime a subscription. */
        async function primingFailuresDuring(action: () => Promise<void>) {
            const failures = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "InteractionServer") {
                        const text = message.values.join(" ");
                        if (text.includes("Error while sending initial data reports")) {
                            failures.push(`${message.level} ${text}`);
                        }
                    }
                },
            });
            try {
                await action();
            } finally {
                delete Logger.destinations.capture;
            }
            return failures;
        }

        function storedIdsOf(node: ServerNode) {
            return node.stateOf(SubscriptionsServer).subscriptions.map(({ subscriptionId }) => subscriptionId);
        }

        function subscribeRequest(abort: AbortController): ClientSubscribe {
            return {
                ...Subscribe({ attributes: [{}], keepSubscriptions: true }),
                sustain: false,
                abort: abort.signal,
            };
        }

        it("answers the priming report that arrives after the cancel with INVALID_SUBSCRIPTION", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const stored = storedIdsOf(device);

            const abort = new AbortController();
            const replies = holdDeviceReplies(device);
            device.env.get(InteractionServer).subscriptionEstablishmentStarted.once(() => abort.abort());

            let outcome: unknown;
            const failures = await primingFailuresDuring(async () => {
                outcome = await MockTime.resolve(
                    peer.interaction.subscribe(subscribeRequest(abort)).then(
                        () => undefined,
                        (error: unknown) => error,
                    ),
                );
                replies.release();
                await MockTime.resolve(MockTime.sleep("device handles the status", Seconds(1)));
            });

            expect(outcome).instanceOf(AbortedError);
            expect(failures).length(1);
            expect(failures[0]).contains("InvalidSubscription");
            expect(failures[0].startsWith(`${LogLevel.DEBUG} `)).true;
            expect(storedIdsOf(device)).deep.equals(stored);
        });

        it("answers the priming report with INVALID_SUBSCRIPTION when the session signal aborts", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const stored = storedIdsOf(device);
            const address = peer.stateOf(CommissioningClient).peerAddress;
            if (address === undefined) {
                expect.fail("peer is not commissioned");
            }
            const interaction = new ClientInteraction({
                environment: peer.env,
                exchangeProvider: peer.env.get(PeerSet).for(address).exchangeProvider,
            });

            const abort = new AbortController();
            const replies = holdDeviceReplies(device);
            device.env.get(InteractionServer).subscriptionEstablishmentStarted.once(() => abort.abort());

            let outcome: unknown;
            const failures = await primingFailuresDuring(async () => {
                outcome = await MockTime.resolve(
                    interaction
                        .subscribe(Subscribe({ attributes: [{}], keepSubscriptions: true }), { abort: abort.signal })
                        .then(
                            () => undefined,
                            (error: unknown) => error,
                        ),
                );
                replies.release();
                await MockTime.resolve(MockTime.sleep("device handles the status", Seconds(1)));
            });
            await MockTime.resolve(interaction.close());

            expect(outcome).instanceOf(AbortedError);
            expect(failures).length(1);
            expect(failures[0]).contains("InvalidSubscription");
            expect(storedIdsOf(device)).deep.equals(stored);
        });

        it("answers the priming report it is processing during the cancel with INVALID_SUBSCRIPTION", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const stored = storedIdsOf(device);

            const abort = new AbortController();
            const request = subscribeRequest(abort);
            request.updated = async chunks => {
                for await (const _chunk of chunks) {
                    abort.abort();
                }
            };

            let outcome: unknown;
            const failures = await primingFailuresDuring(async () => {
                outcome = await MockTime.resolve(
                    peer.interaction.subscribe(request).then(
                        () => undefined,
                        (error: unknown) => error,
                    ),
                );
                await MockTime.resolve(MockTime.sleep("device handles the status", Seconds(1)));
            });

            expect(outcome).instanceOf(AbortedError);
            expect(failures).length(1);
            expect(failures[0]).contains("InvalidSubscription");
            expect(storedIdsOf(device)).deep.equals(stored);
        });

        it("answers the priming report with INVALID_SUBSCRIPTION when processing fails before reading it", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const stored = storedIdsOf(device);

            const request = subscribeRequest(new AbortController());
            request.updated = async () => {
                throw new SubscribeRefusedError("not reading");
            };

            let outcome: unknown;
            const failures = await primingFailuresDuring(async () => {
                outcome = await MockTime.resolve(
                    peer.interaction.subscribe(request).then(
                        () => undefined,
                        (error: unknown) => error,
                    ),
                );
                await MockTime.resolve(MockTime.sleep("device handles the status", Seconds(1)));
            });

            expect(outcome).instanceOf(SubscribeRefusedError);
            expect(failures).length(1);
            expect(failures[0]).contains("InvalidSubscription");
            expect(storedIdsOf(device)).deep.equals(stored);
        });

        it("answers the priming report with INVALID_SUBSCRIPTION when processing it fails", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const stored = storedIdsOf(device);

            const request = subscribeRequest(new AbortController());
            request.updated = async chunks => {
                for await (const _chunk of chunks) {
                    throw new SubscribeRefusedError("priming refused");
                }
            };

            let outcome: unknown;
            const failures = await primingFailuresDuring(async () => {
                outcome = await MockTime.resolve(
                    peer.interaction.subscribe(request).then(
                        () => undefined,
                        (error: unknown) => error,
                    ),
                );
                await MockTime.resolve(MockTime.sleep("device handles the status", Seconds(1)));
            });

            expect(outcome).instanceOf(SubscribeRefusedError);
            expect(failures).length(1);
            expect(failures[0]).contains("InvalidSubscription");
            expect(storedIdsOf(device)).deep.equals(stored);
        });
    });
});
