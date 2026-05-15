/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { Write } from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Binding } from "@matter/types/clusters/binding";
import { AccessControlServer } from "../../../src/behaviors/access-control/AccessControlServer.js";
import { BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { OnOffClient } from "../../../src/behaviors/on-off/OnOffClient.js";
import { OnOffServer } from "../../../src/behaviors/on-off/OnOffServer.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { OnOffLightDevice } from "../../../src/devices/on-off-light.js";
import { ClientGroup } from "../../../src/node/ClientGroup.js";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";

describe("Binding integration", () => {
    before(() => {
        MockTime.init();
    });

    it("kind=client: admin writes binding → established fires → command round-trips to peer → removed fires", async () => {
        await using site = new MockSite();

        // Commission the switch (device index 2) to the controller (index 1).
        // OnOffLightSwitchDevice declares OnOffClient; we add BindingServer so the Binding
        // cluster is installed and the BindingManager activates on the switch.
        // MockServerNode.RootEndpoint adds ControllerBehavior so the switch can initiate CASE
        // sessions to the light (required by BindingManager when it resolves the client kind).
        const { controller, device: switchNode } = await site.addCommissionedPair({
            device: {
                type: MockServerNode.RootEndpoint,
                device: OnOffLightSwitchDevice.with(BindingServer),
            },
        });

        // Commission the light (device index 3) to the same controller.
        const lightNode = await site.addDevice({ index: 3, device: OnOffLightDevice });
        const lightCrypto = lightNode.env.get(Crypto) as MockCrypto;
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = lightCrypto.entropic = true;
        const { passcode, discriminator } = lightNode.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });
        controllerCrypto.entropic = lightCrypto.entropic = false;

        // Grant any CASE-authenticated fabric member Operate access on the light so the switch
        // (which is on the same fabric) can invoke OnOff commands.
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

        // Get the controller's peer view of the light — the second commissioned peer.
        const peerLight = controller.peers.get("peer2")!;
        expect(peerLight).not.undefined;

        // The binding entry on the switch must point to the light's operational address as seen
        // from the shared fabric (fabricIndex and nodeId on the switch's fabric).
        const lightPeerAddress = peerLight.state.commissioning.peerAddress!;
        expect(lightPeerAddress).not.undefined;

        // Subscribe to established / removed on the switch's BindingServer BEFORE writing the
        // binding attribute so we don't race the event.
        const switchEp = switchNode.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();

        // resolveEstablished drives MockTime resolution after the write.
        let resolveEstablished!: () => void;
        const establishedPromise = new Promise<void>(res => (resolveEstablished = res));

        await switchEp.act("subscribe", agent => {
            const server = agent.get(BindingServer);
            server.binding.established.on(r => {
                void established.push(r);
                resolveEstablished();
            });
            server.binding.removed.on(r => void removed.push(r));
        });

        // Get the controller's peer view of the switch — the first commissioned peer.
        const peerSwitch = controller.peers.get("peer1")!;
        expect(peerSwitch).not.undefined;

        // Write the binding entry on the switch via the controller interaction.  The entry points
        // to the light's endpoint 1 on the shared fabric.
        const bindingEntry = new Binding.Target({
            node: lightPeerAddress.nodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: lightPeerAddress.fabricIndex,
        });

        // The switch→light CASE handshake requires entropy on both sides, same as commissioning.
        const switchCrypto = switchNode.env.get(Crypto) as MockCrypto;
        switchCrypto.entropic = lightCrypto.entropic = true;

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

        // Drive the switch→light CASE handshake; established fires once the peer is online.
        await MockTime.resolve(establishedPromise, { macrotasks: true });

        switchCrypto.entropic = lightCrypto.entropic = false;

        expect(established).has.length(1);

        const resolution = established[0] as BindingResolution & { kind: "client" };
        expect(resolution.kind).equals("client");

        // The materialized endpoint on the switch's ClientNode must carry OnOffClient.
        const targetEp = resolution.endpoint;
        expect(targetEp.behaviors.has(OnOffClient)).true;

        // Invoke On via the materialized endpoint — the command travels over the mock wire to
        // the light's OnOffServer and flips its state.
        await MockTime.resolve(targetEp.commandsOf(OnOffClient).on(), { macrotasks: true });

        expect(lightNode.parts.get(1)!.stateOf(OnOffServer).onOff).true;

        // Write empty binding list → BindingManager calls unregister → removed fires.
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

        for (let i = 0; i < 20 && removed.length === 0; i++) {
            await Promise.resolve();
        }
        expect(removed).has.length(1);
        expect(removed[0].kind).equals("client");
    });

    it("kind=server: self-binding resolves locally and dispatches to the bound server endpoint", async () => {
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightSwitchDevice.with(BindingServer),
        });
        const fabric = await node.addFabric();
        const lightEp = await node.add(OnOffLightDevice, { number: EndpointNumber(2) });

        const switchEp = node.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();

        await switchEp.act("subscribe", agent => {
            const server = agent.get(BindingServer);
            server.binding.established.on(r => void established.push(r));
            server.binding.removed.on(r => void removed.push(r));
        });

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

        for (let i = 0; i < 20 && established.length === 0; i++) {
            await Promise.resolve();
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

        for (let i = 0; i < 20 && removed.length === 0; i++) {
            await Promise.resolve();
        }
        expect(removed).has.length(1);
        expect(removed[0].kind).equals("server");

        await node.close();
    });

    it("kind=group: binding resolves to ClientGroup with OnOffClient installed on materialized endpoint", async () => {
        // MockSite's NetworkSimulator has no multicast loopback, so we cannot drive a full
        // command round-trip through the group address.  The test therefore verifies the
        // BindingServer → BindingManager → ClientGroup resolution pipeline end-to-end and
        // confirms the materialized endpoint carries the correct client behavior, leaving
        // wire-level command delivery to the unit tests in BindingManagerTest.
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightSwitchDevice.with(BindingServer),
        });
        const fabric = await node.addFabric();

        const switchEp = node.parts.get(1)!;
        switchEp.behaviors.require(BindingServer);
        await switchEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();

        await switchEp.act("subscribe", agent => {
            const server = agent.get(BindingServer);
            server.binding.established.on(r => void established.push(r));
            server.binding.removed.on(r => void removed.push(r));
        });

        // Register the switch endpoint as a member of group 5 so the manager accepts the entry.
        fabric.groups.endpoints.set(GroupId(5), [switchEp.number]);

        // Pre-warm so the ClientGroup is in the cache before the binding write.
        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(5)),
        });

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

        for (let i = 0; i < 20 && established.length === 0; i++) {
            await Promise.resolve();
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

        for (let i = 0; i < 20 && removed.length === 0; i++) {
            await Promise.resolve();
        }
        expect(removed).has.length(1);
        expect(removed[0].kind).equals("group");

        await node.close();
    });
});
