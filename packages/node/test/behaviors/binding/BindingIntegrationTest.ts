/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    Diagnostic,
    Lifecycle,
    LogDestination,
    LogFormat,
    LogLevel,
    Logger,
    MockCrypto,
    MockNetwork,
    Network,
    Seconds,
    Time,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    ClientInvoke,
    GroupKeySetMissingError,
    Invoke,
    Read,
    SessionManager,
    SustainedSubscription,
    Write,
} from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Binding } from "@matter/types/clusters/binding";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { OnOff } from "@matter/types/clusters/on-off";
import { NetworkClient } from "../../../src/behavior/system/network/NetworkClient.js";
import { AccessControlServer } from "../../../src/behaviors/access-control/AccessControlServer.js";
import { BasicInformationClient } from "../../../src/behaviors/basic-information/BasicInformationClient.js";
import { BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { DescriptorClient } from "../../../src/behaviors/descriptor/DescriptorClient.js";
import { GroupsClient } from "../../../src/behaviors/groups/GroupsClient.js";
import { OnOffClient } from "../../../src/behaviors/on-off/OnOffClient.js";
import { OnOffServer } from "../../../src/behaviors/on-off/OnOffServer.js";
import { OperationalCredentialsClient } from "../../../src/behaviors/operational-credentials/OperationalCredentialsClient.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { OnOffLightDevice } from "../../../src/devices/on-off-light.js";
import type { Endpoint } from "../../../src/endpoint/Endpoint.js";
import { InvalidGroupOperationError } from "../../../src/node/client/ClientGroupInteraction.js";
import { ClientNodeInteraction } from "../../../src/node/client/ClientNodeInteraction.js";
import { ClientGroup } from "../../../src/node/ClientGroup.js";
import { NodeConnectionState } from "../../../src/node/ClientNodeLifecycle.js";
import type { ServerNode } from "../../../src/node/ServerNode.js";
import { ClientNodeStore } from "../../../src/storage/client/ClientNodeStore.js";

describe("Binding integration", () => {
    before(() => {
        MockTime.init();
    });

    /**
     * Commissions a switch and a light to one controller and binds the switch's endpoint 1 to the light's endpoint 1.
     * The switch→light CASE handshakes need entropy on both sides, so {@link entropic} switches it for both.
     */
    async function boundLight(site: MockSite) {
        // OnOffLightSwitchDevice declares OnOffClient and includes BindingServer, so the BindingManager activates on
        // the switch.  MockServerNode.RootEndpoint adds ControllerBehavior so the switch can initiate CASE sessions to
        // the light (required by BindingManager when it resolves the client kind).
        const { controller, device: switchNode } = await site.addCommissionedPair({
            device: {
                type: MockServerNode.RootEndpoint,
                device: OnOffLightSwitchDevice,
            },
        });

        const lightNode = await site.addDevice({ index: 3, device: OnOffLightDevice });
        const lightCrypto = lightNode.env.get(Crypto) as MockCrypto;
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = lightCrypto.entropic = true;
        const { passcode, discriminator } = lightNode.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });
        controllerCrypto.entropic = lightCrypto.entropic = false;

        // Grant any CASE-authenticated fabric member Operate access on the light so the switch (which is on the same
        // fabric) can invoke OnOff commands.
        await lightNode.act("grant-operate", agent => {
            const acl = agent.get(AccessControlServer);
            acl.state.acl = [
                ...acl.state.acl,
                new AccessControl.AccessControlEntry({
                    privilege: AccessControl.AccessControlEntryPrivilege.Operate,
                    authMode: AccessControl.AccessControlEntryAuthMode.Case,
                    subjects: null,
                    targets: null,
                    fabricIndex: FabricIndex(1),
                }),
            ];
        });

        // The binding entry on the switch points to the light's operational address on the shared fabric
        const lightPeerAddress = controller.peers.get("peer2")!.state.commissioning.peerAddress!;
        expect(lightPeerAddress).not.undefined;

        // Subscribe to established / removed before writing the binding attribute so we don't race the event
        const switchEp = switchNode.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();
        let resolveEstablished!: () => void;
        const establishedPromise = new Promise<void>(res => (resolveEstablished = res));
        switchEp.eventsOf(BindingServer).established.on(r => {
            void established.push(r);
            resolveEstablished();
        });
        switchEp.eventsOf(BindingServer).removed.on(r => void removed.push(r));

        const peerSwitch = controller.peers.get("peer1")!;
        expect(peerSwitch).not.undefined;

        const bindingEntry = new Binding.Target({
            node: lightPeerAddress.nodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: lightPeerAddress.fabricIndex,
        });

        const switchCrypto = switchNode.env.get(Crypto) as MockCrypto;
        const entropic = (on: boolean) => {
            switchCrypto.entropic = lightCrypto.entropic = on;
        };

        entropic(true);
        await MockTime.resolve(
            peerSwitch.interaction.write(
                Write(
                    Write.Attribute({
                        endpoint: EndpointNumber(1),
                        cluster: Binding,
                        attributes: "binding",
                        value: [bindingEntry],
                    }),
                ),
            ),
            { macrotasks: true },
        );

        // Drive the switch→light CASE handshake; established fires once the peer is online
        await MockTime.resolve(establishedPromise, { macrotasks: true });
        entropic(false);

        expect(established).has.length(1);
        const resolution = established[0];
        if (resolution.kind !== "client") {
            expect.fail(`Expected a client binding resolution, got ${resolution.kind}`);
        }

        return {
            switchNode,
            lightNode,
            peerSwitch,
            lightPeerAddress,
            bindingEntry,
            established,
            removed,
            resolution,
            entropic,
        };
    }

    /**
     * Subscribes the bound node to the light's `onOff` attribute only, as the binding examples do, and returns the
     * default subscription once it is active.
     */
    async function subscribeToOnOff(
        resolution: BindingResolution & { kind: "client" },
        entropic: (on: boolean) => void,
    ) {
        // Wire up the subscription-active signal before enabling the subscription so we don't miss the
        // subscriptionStatusChanged(true) event that fires when the handshake completes.
        const subscriptionActive = new Promise<void>(resolve => {
            const handler = (isActive: boolean) => {
                if (isActive) {
                    resolution.node.eventsOf(NetworkClient).subscriptionStatusChanged.off(handler);
                    resolve();
                }
            };
            resolution.node.eventsOf(NetworkClient).subscriptionStatusChanged.on(handler);
        });

        // The bootstrap read populates cached state; subsequent attribute reports arrive via the subscription.  The
        // async reactor (#syncAutoSubscribe) fires after set() resolves, so we drive it to completion separately via
        // subscriptionActive.
        entropic(true);
        void resolution.node.set({
            network: {
                defaultSubscription: Read(
                    Read.Attribute({
                        endpoint: EndpointNumber(1),
                        cluster: OnOff.Cluster,
                        attributes: "onOff",
                    }),
                ),
                autoSubscribe: true,
            },
        });
        await MockTime.resolve(subscriptionActive, { macrotasks: true });
        entropic(false);

        const subscription = resolution.node.behaviors.internalsOf(NetworkClient).activeSubscription;
        if (!(subscription instanceof SustainedSubscription)) {
            expect.fail("Expected a sustained default subscription");
        }
        return subscription;
    }

    /** Switches the light and waits until the bound endpoint reports the new value. */
    async function switchLight(
        lightNode: ServerNode,
        resolution: BindingResolution & { kind: "client" },
        onOff: boolean,
    ) {
        const reported = new Promise<void>(resolve => {
            const handler = (value: boolean) => {
                if (value === onOff) {
                    resolution.endpoint.eventsOf(OnOffClient).onOff$Changed.off(handler);
                    resolve();
                }
            };
            resolution.endpoint.eventsOf(OnOffClient).onOff$Changed.on(handler);
        });
        await lightNode.parts.get(1)!.act(onOff ? "on" : "off", agent => {
            const server = agent.get(OnOffServer);
            return onOff ? server.on() : server.off();
        });
        await MockTime.resolve(reported, { macrotasks: true });
        expect(resolution.endpoint.stateOf(OnOffClient).onOff).equals(onOff);
    }

    it("kind=client: admin writes binding → established fires → command round-trips to peer → removed fires", async () => {
        await using site = new MockSite();
        const { lightNode, peerSwitch, lightPeerAddress, bindingEntry, established, removed, resolution, entropic } =
            await boundLight(site);

        // The materialized endpoint on the switch's ClientNode must carry OnOffClient.
        const targetEp = resolution.endpoint;
        expect(targetEp.behaviors.has(OnOffClient)).true;

        // Invoke On via the materialized endpoint — the command travels over the mock wire to
        // the light's OnOffServer and flips its state.
        await MockTime.resolve(targetEp.commandsOf(OnOffClient).on(), { macrotasks: true });

        expect(lightNode.parts.get(1)!.stateOf(OnOffServer).onOff).true;

        // Register the change observer before enabling the subscription so the initial
        // attribute report from the bootstrap read is not missed.
        const onOffUpdates = new Array<boolean>();
        resolution.endpoint.eventsOf(OnOffClient).onOff$Changed.on(v => void onOffUpdates.push(v));

        await subscribeToOnOff(resolution, entropic);

        // Bootstrap read populated initial state — light is on from the invoke above.
        expect(resolution.endpoint.stateOf(OnOffClient).onOff).true;

        // Turn the light off; the subscription delivers the updated state.
        await switchLight(lightNode, resolution, false);
        expect(onOffUpdates).deep.equals([true, false]);

        // Write a two-entry list: original bindingEntry plus a second entry pointing at the light's root endpoint.
        // This verifies that a chunked wire write (REPLACE_ALL + ADD) produces only one established event per new
        // entry (no cascade) and that already-resolved peers (the light is online) fire immediately.
        const secondEntry = new Binding.Target({
            node: lightPeerAddress.nodeId,
            endpoint: EndpointNumber(0),
            cluster: undefined,
            group: undefined,
            fabricIndex: lightPeerAddress.fabricIndex,
        });

        await MockTime.resolve(
            peerSwitch.interaction.write(
                Write(
                    Write.Attribute({
                        endpoint: EndpointNumber(1),
                        cluster: Binding,
                        attributes: "binding",
                        value: [bindingEntry, secondEntry],
                    }),
                ),
            ),
            { macrotasks: true },
        );

        while (established.length < 2) {
            await MockTime.yield();
        }
        expect(established).has.length(2);

        const resolution2 = established[1] as BindingResolution & { kind: "client" };
        expect(resolution2.kind).equals("client");
        expect(resolution2.entry.endpoint).equals(0);
        expect(resolution2.endpoint.behaviors.has(OnOffClient)).true;

        // Write only the original entry — drops secondEntry → removed fires once.
        await MockTime.resolve(
            peerSwitch.interaction.write(
                Write(
                    Write.Attribute({
                        endpoint: EndpointNumber(1),
                        cluster: Binding,
                        attributes: "binding",
                        value: [bindingEntry],
                    }),
                ),
            ),
            { macrotasks: true },
        );

        while (removed.length < 1) {
            await MockTime.yield();
        }
        expect(removed).has.length(1);
        expect(removed[0].entry.endpoint).equals(0);

        // Write empty binding list → BindingManager calls unregister → removed fires for the remaining entry.
        await MockTime.resolve(
            peerSwitch.interaction.write(
                Write(
                    Write.Attribute({
                        endpoint: EndpointNumber(1),
                        cluster: Binding,
                        attributes: "binding",
                        value: [],
                    }),
                ),
            ),
            { macrotasks: true },
        );

        while (removed.length < 2) {
            await MockTime.yield();
        }
        expect(removed).has.length(2);
        expect(removed[1].kind).equals("client");
    });

    describe("kind=client with a default subscription of one attribute", () => {
        /**
         * Collects the messages {@link node}, or no known node, logged at warn level or above while {@link run} runs.
         */
        async function problemsDuring(node: ServerNode, run: () => Promise<void>) {
            const problems = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.level < LogLevel.WARN) {
                        return;
                    }
                    let origin = message.origin;
                    while (origin?.parent !== undefined) {
                        origin = origin.parent;
                    }
                    if (origin === undefined || origin.name === node.id) {
                        problems.push(`${message.facility}: ${message.values.join(" ")}`);
                    }
                },
            });
            try {
                await run();
            } finally {
                delete Logger.destinations.capture;
            }
            return problems;
        }

        /** Drops every packet from or to {@link node} while the returned switch is on. */
        function isolate(node: ServerNode) {
            const network = node.env.get(Network);
            if (!(network instanceof MockNetwork)) {
                expect.fail(`${node} has no mock network`);
            }
            const { ipV4, ipV6 } = network.getIpMac("fake0");
            const addresses = new Set([...ipV4, ...ipV6]);
            const isolation = { on: false };
            network.simulator.router.intercept((packet, route) => {
                if (isolation.on && (addresses.has(packet.sourceAddress) || addresses.has(packet.destAddress))) {
                    return;
                }
                route(packet);
            });
            return isolation;
        }

        it("receives reports without data of the peer's root endpoint", async () => {
            await using site = new MockSite();
            const { switchNode, lightNode, resolution, entropic } = await boundLight(site);

            const problems = await problemsDuring(switchNode, async () => {
                await subscribeToOnOff(resolution, entropic);
                await switchLight(lightNode, resolution, true);
                await switchLight(lightNode, resolution, false);
            });

            const { node } = resolution;
            expect(node.behaviors.has(BasicInformationClient)).false;
            expect(node.behaviors.has(DescriptorClient)).false;
            expect(node.behaviors.has(OperationalCredentialsClient)).false;
            expect(node.lifecycle.connectionState).equals(NodeConnectionState.Connected);
            expect(switchNode.peers.size).equals(1);
            expect(problems).deep.equals([]);
        });

        it("detects a lost peer by the subscription timeout and resubscribes once it is back", async () => {
            await using site = new MockSite();
            const { switchNode, lightNode, resolution, entropic } = await boundLight(site);
            const isolation = isolate(lightNode);
            const subscription = await subscribeToOnOff(resolution, entropic);
            const { maxInterval } = subscription;
            const statuses = new Array<boolean>();
            resolution.node.eventsOf(NetworkClient).subscriptionStatusChanged.on(status => void statuses.push(status));

            const problems = await problemsDuring(switchNode, async () => {
                // A report just before the loss starts the subscription timeout
                await switchLight(lightNode, resolution, true);
                isolation.on = true;
                const lostAt = Time.nowUs;
                await MockTime.resolve(subscription.inactive);
                expect(Time.nowUs - lostAt).at.least(Seconds(maxInterval));
                expect(statuses).deep.equals([false]);

                entropic(true);
                isolation.on = false;
                await MockTime.resolve(subscription.active, { macrotasks: true });
                entropic(false);
                expect(statuses).deep.equals([false, true]);
                await switchLight(lightNode, resolution, false);
            });

            expect(resolution.node.behaviors.internalsOf(NetworkClient).activeSubscription).equals(subscription);
            expect(switchNode.peers.size).equals(1);
            expect(problems).deep.equals([]);
        });

        it("detects a restarting peer by the subscription timeout and resubscribes after its restart", async () => {
            await using site = new MockSite();
            const { switchNode, lightNode, resolution, entropic } = await boundLight(site);
            const isolation = isolate(lightNode);
            const subscription = await subscribeToOnOff(resolution, entropic);

            const problems = await problemsDuring(switchNode, async () => {
                await switchLight(lightNode, resolution, true);

                // A power loss: the light goes away without a word to the switch
                isolation.on = true;
                await MockTime.resolve(lightNode.stop());
                await MockTime.resolve(subscription.inactive);

                entropic(true);
                isolation.on = false;
                await MockTime.resolve(lightNode.start());
                await MockTime.resolve(subscription.active, { macrotasks: true });
                entropic(false);
                await switchLight(lightNode, resolution, false);
            });

            expect(switchNode.peers.size).equals(1);
            expect(problems).deep.equals([]);
        });
    });

    it("kind=server: self-binding resolves locally and dispatches to the bound server endpoint", async () => {
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightSwitchDevice,
        });
        const fabric = await node.addFabric();
        const lightEp = await node.add(OnOffLightDevice, { number: EndpointNumber(2) });

        const switchEp = node.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();
        switchEp.eventsOf(BindingServer).established.on(r => void established.push(r));
        switchEp.eventsOf(BindingServer).removed.on(r => void removed.push(r));

        const entry = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: lightEp.number,
            cluster: undefined,
            group: undefined,
        });

        await switchEp.act("write", agent => {
            agent.get(BindingServer).state.binding = [entry];
        });

        while (established.length === 0) {
            await MockTime.yield();
        }

        expect(established).has.length(1);
        const resolution = established[0] as BindingResolution & { kind: "server" };
        expect(resolution.kind).equals("server");
        expect(resolution.node).equals(node);
        expect(resolution.endpoint).equals(lightEp);

        await lightEp.act("send-on", agent => agent.get(OnOffServer).on());
        expect(lightEp.stateOf(OnOffServer).onOff).true;

        await switchEp.act("clear", agent => {
            agent.get(BindingServer).state.binding = [];
        });

        while (removed.length === 0) {
            await MockTime.yield();
        }
        expect(removed).has.length(1);
        expect(removed[0].kind).equals("server");

        await node.close();
    });

    it("kind=group: binding resolves to ClientGroup with OnOffClient installed on materialized endpoint", async () => {
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightSwitchDevice,
        });
        const fabric = await node.addFabric();

        const switchEp = node.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();
        switchEp.eventsOf(BindingServer).established.on(r => void established.push(r));
        switchEp.eventsOf(BindingServer).removed.on(r => void removed.push(r));

        // Pre-warm so the ClientGroup is in the cache before the binding write.
        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(5)),
        });
        await fabric.groups.setFromGroupKeySet({
            groupKeySetId: 0x1a1,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
            epochStartTime0: 1n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        });
        fabric.groups.groupKeyIdMap.set(GroupId(5), 0x1a1);

        const entry = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: undefined,
            endpoint: undefined,
            group: GroupId(5),
            cluster: undefined,
        });

        await switchEp.act("write", agent => {
            agent.get(BindingServer).state.binding = [entry];
        });

        for (let turn = 0; established.length === 0 && turn < 100; turn++) {
            await MockTime.yield();
        }

        expect(established).has.length(1);
        const resolution = established[0] as BindingResolution & { kind: "group" };
        expect(resolution.kind).equals("group");
        expect(resolution.node).instanceof(ClientGroup);

        const groupEp = resolution.endpoint;
        expect(groupEp.behaviors.has(OnOffClient)).true;

        const commands = groupEp.commandsOf(OnOffClient);
        expect(typeof commands.on).equals("function");

        await switchEp.act("clear", agent => {
            agent.get(BindingServer).state.binding = [];
        });

        for (let turn = 0; removed.length === 0 && turn < 100; turn++) {
            await MockTime.yield();
        }
        expect(removed).has.length(1);
        expect(removed[0].kind).equals("group");

        await node.close();
    });
});

describe("Binding integration, group sends", () => {
    before(() => {
        MockTime.init();
    });

    const GROUP = GroupId(5);
    const KEY_SET_ID = 0x1a1;

    const SwitchWithGroupsClient = OnOffLightSwitchDevice.withClientClusters(GroupsClient);

    async function switchNode() {
        const node = await MockServerNode.createOnline(undefined, { device: SwitchWithGroupsClient });
        const fabric = await node.addFabric();
        const switchEp = node.parts.get(1)!;
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        switchEp.eventsOf(BindingServer).established.on(r => void established.push(r));

        return { node, fabric, switchEp, established };
    }

    /** Gives the fabric the switch sends on the group's key, as GroupKeyManagement KeySetWrite and GroupKeyMap do. */
    async function provisionKey(node: MockServerNode, fabricIndex: FabricIndex) {
        const fabric = node.env.get(SessionManager).fabricFor(fabricIndex);
        await fabric.groups.setFromGroupKeySet({
            groupKeySetId: KEY_SET_ID,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
            epochStartTime0: 1n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        });
        fabric.groups.groupKeyIdMap.set(GROUP, KEY_SET_ID);
    }

    async function writeGroupBinding(switchEp: Endpoint, fabricIndex: FabricIndex) {
        await switchEp.act("write", agent => {
            agent.get(BindingServer).state.binding = [
                new Binding.Target({
                    fabricIndex,
                    node: undefined,
                    endpoint: undefined,
                    group: GROUP,
                    cluster: undefined,
                }),
            ];
        });
    }

    async function awaitResolution(established: BindingResolution[]) {
        for (let turn = 0; established.length === 0 && turn < 100; turn++) {
            await MockTime.yield();
        }
        const [resolution] = established;
        if (resolution === undefined) {
            expect.fail("the group binding did not resolve");
        }
        if (resolution.kind !== "group") {
            expect.fail(`expected a group resolution, got ${resolution.kind}`);
        }
        return resolution;
    }

    async function bindGroup(switchEp: Endpoint, fabricIndex: FabricIndex, established: BindingResolution[]) {
        await writeGroupBinding(switchEp, fabricIndex);
        return awaitResolution(established);
    }

    /**
     * Records the invokes the group interaction hands on to the node interaction beneath it, which is what goes on the
     * wire, and restores that interaction on dispose.
     */
    function recordSent() {
        const invokes = new Array<ClientInvoke>();
        const { invoke } = ClientNodeInteraction.prototype;
        ClientNodeInteraction.prototype.invoke = function (this: ClientNodeInteraction, request, context) {
            invokes.push(request);
            return invoke.call(this, request, context);
        };
        return {
            invokes,
            [Symbol.dispose]() {
                ClientNodeInteraction.prototype.invoke = invoke;
            },
        };
    }

    it("records no cache fabric filter for a group", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        const problems = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.facility === "NetworkClient" && message.level >= LogLevel.WARN) {
                    problems.push(message.values.join(" "));
                }
            },
        });
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);
            await MockTime.resolve(resolution.node.start(), { macrotasks: true });

            expect(resolution.node.construction.status).equals(Lifecycle.Status.Active);
            expect(resolution.node.env.get(ClientNodeStore).cacheFabricFiltered).undefined;
            expect(problems).deep.equals([]);
        } finally {
            delete Logger.destinations.capture;
            await node.close();
        }
    });

    it("sends a command through a binding as a group command without an endpoint", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);
            using sent = recordSent();

            await MockTime.resolve(resolution.endpoint.commandsOf(OnOffClient).on(), { macrotasks: true });

            expect(sent.invokes).length(1);
            const [{ commandPath }] = sent.invokes[0].invokeRequests;
            expect(commandPath.endpointId).undefined;
            expect(commandPath.clusterId).equals(OnOff.id);
            expect(commandPath.commandId).equals(OnOff.commands.on.id);
            expect(sent.invokes[0].suppressResponse).true;
            expect(
                [...sent.invokes[0].commands.values()].map(cmd => ("endpoint" in cmd ? cmd.endpoint : undefined)),
            ).deep.equals([undefined]);
        } finally {
            await node.close();
        }
    });

    it("names the group on the log line of a group command it sends", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        const lines = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                lines.push(LogFormat.formats.plain(message));
            },
        });
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);

            await MockTime.resolve(resolution.endpoint.commandsOf(OnOffClient).on(), { macrotasks: true });

            expect(lines.some(line => /ClientInteraction Invoke » \S+ group: 5 dest: .* \*\.onOff\.on /.test(line)))
                .true;
        } finally {
            delete Logger.destinations.capture;
            await node.close();
        }
    });

    it("refuses a timed invoke on a group", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);

            const timed = Invoke({
                commands: [Invoke.WildcardCommandRequest({ cluster: OnOff, command: "on" })],
                timed: true,
            });

            expect(() => resolution.node.interaction.invoke(timed)).throws(InvalidGroupOperationError);
        } finally {
            await node.close();
        }
    });

    it("resolves a command with a response to undefined on a group", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);

            const response = await MockTime.resolve(
                resolution.endpoint.commandsOf(GroupsClient).addGroup({ groupId: GroupId(7), groupName: "" }),
                { macrotasks: true },
            );

            expect(response).undefined;
        } finally {
            await node.close();
        }
    });

    it("resolves a group binding written before the sender holds the group's key once it does, and sends", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        try {
            await writeGroupBinding(switchEp, fabric.fabricIndex);
            for (let turn = 0; turn < 20; turn++) {
                await MockTime.yield();
            }
            expect(established).length(0);

            await provisionKey(node, fabric.fabricIndex);
            const resolution = await awaitResolution(established);
            using sent = recordSent();

            await MockTime.resolve(resolution.endpoint.commandsOf(OnOffClient).on(), { macrotasks: true });

            expect(sent.invokes).length(1);
        } finally {
            await node.close();
        }
    });

    async function drain(result: AsyncIterable<unknown>) {
        for await (const _chunk of result);
    }

    it("fails a group send for which the sender holds no key", async () => {
        const { node, fabric } = await switchNode();
        try {
            const group = await node.peers.forAddress({
                fabricIndex: fabric.fabricIndex,
                nodeId: NodeId.fromGroupId(GROUP),
            });
            const on = Invoke({ commands: [Invoke.WildcardCommandRequest({ cluster: OnOff, command: "on" })] });

            await expect(MockTime.resolve(drain(group.interaction.invoke(on)), { macrotasks: true })).rejectedWith(
                GroupKeySetMissingError,
                `No group key set found for groupId ${GROUP}`,
            );
        } finally {
            await node.close();
        }
    });

    it("refuses a group invoke that names an endpoint", async () => {
        const { node, fabric, switchEp, established } = await switchNode();
        try {
            await provisionKey(node, fabric.fabricIndex);
            const resolution = await bindGroup(switchEp, fabric.fabricIndex, established);
            const concrete = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "on" }),
                ],
            });

            expect(() => resolution.node.interaction.invoke(concrete)).throws(
                InvalidGroupOperationError,
                "Invoking a concrete command on a group address is not supported.",
            );
        } finally {
            await node.close();
        }
    });
});
