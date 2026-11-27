/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementClient, GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupsServer } from "#behaviors/groups";
import { ServerNode } from "#node/index.js";
import { Bytes } from "@matter/general";
import { causeMessagesOf, MockExchange, MockServerNode, MockSite } from "@matter/node/testing";
import { FabricManager, ProtocolMocks } from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId, Status } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

describe("GroupKeyManagementServer", () => {
    before(() => {
        MockTime.init();
    });

    it("rejects the provisional Groupcast feature", async () => {
        const messages = await causeMessagesOf(
            MockServerNode.create(MockServerNode.RootEndpoint.with(GroupKeyManagementServer.with("Groupcast"))),
        );

        expect(messages).contains("Groupcast feature of GroupKeyManagement is provisional");
    });

    it("does not implement the provisional GroupcastAdoption attribute by default", () => {
        const state = new (GroupKeyManagementServer.with("Groupcast").State)();

        expect(state.groupcastAdoption).undefined;
    });

    it("prevents too many group keys", async () => {
        await using site = new MockSite();
        // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                groupKeyManagement: {
                    maxGroupKeysPerFabric: 3,
                },
            },
        });

        // Get the client view of the device (peer)
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const cmds = peer1.commandsOf(GroupKeyManagementClient);

        await cmds.keySetWrite({
            groupKeySet: {
                groupKeySetId: 1,
                groupKeySecurityPolicy: 0,
                epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime0: 18446744073709551612n,
                epochKey1: Bytes.fromHex("d1d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime1: 18446744073709551613n,
                epochKey2: Bytes.fromHex("d2d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime2: 18446744073709551614n,
            },
        });

        await cmds.keySetWrite({
            groupKeySet: {
                groupKeySetId: 2,
                groupKeySecurityPolicy: 0,
                epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime0: 18446744073709551612n,
                epochKey1: Bytes.fromHex("d1d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime1: 18446744073709551613n,
                epochKey2: Bytes.fromHex("d2d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime2: 18446744073709551614n,
            },
        });

        await expect(
            cmds.keySetWrite({
                groupKeySet: {
                    groupKeySetId: 3,
                    groupKeySecurityPolicy: 0,
                    epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime0: 18446744073709551612n,
                    epochKey1: Bytes.fromHex("d1d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime1: 18446744073709551613n,
                    epochKey2: Bytes.fromHex("d2d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime2: 18446744073709551614n,
                },
            }),
        ).rejectedWith("Resource exhausted (code 137)");
    });

    describe("GroupKeyMulticastPolicy", () => {
        const keySet = {
            groupKeySetId: 1,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
            epochStartTime0: 18446744073709551612n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        };

        it("accepts a key set whose multicast policy is not PerGroupID and does not store the policy", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint },
            });
            const cmds = controller.peers.get("peer1")!.commandsOf(GroupKeyManagementClient);

            await cmds.keySetWrite({
                groupKeySet: {
                    ...keySet,
                    groupKeyMulticastPolicy: GroupKeyManagement.GroupKeyMulticastPolicy.AllNodes,
                },
            });

            const [stored] = device.stateOf(GroupKeyManagementServer).groupKeySets;
            expect(stored.groupKeySetId).equals(1);
            expect(stored.groupKeyMulticastPolicy).undefined;
        });

        it("reports PerGroupID for a written key set and for the IPK key set", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint },
            });
            const cmds = controller.peers.get("peer1")!.commandsOf(GroupKeyManagementClient);

            await cmds.keySetWrite({
                groupKeySet: {
                    ...keySet,
                    groupKeyMulticastPolicy: GroupKeyManagement.GroupKeyMulticastPolicy.AllNodes,
                },
            });

            for (const groupKeySetId of [0, 1]) {
                const { groupKeySet } = await cmds.keySetRead({ groupKeySetId });
                expect(groupKeySet.groupKeySetId).equals(groupKeySetId);
                expect(groupKeySet.groupKeyMulticastPolicy).equals(
                    GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId,
                );
            }
        });

        it("drops the policy from key sets stored by earlier versions", async () => {
            const node = await MockServerNode.create(MockServerNode.RootEndpoint, {
                groupKeyManagement: {
                    groupKeySets: [
                        {
                            ...keySet,
                            groupKeyMulticastPolicy: GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId,
                            fabricIndex: FabricIndex(1),
                        },
                    ],
                },
            });

            try {
                const [stored] = node.stateOf(GroupKeyManagementServer).groupKeySets;
                expect(stored.groupKeySetId).equals(1);
                expect(stored.groupKeyMulticastPolicy).undefined;
            } finally {
                await node.close();
            }
        });
    });

    it("prunes GroupKeyMap entries that reference a removed key set", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint },
        });

        const peer1 = controller.peers.get("peer1")!;
        const cmds = peer1.commandsOf(GroupKeyManagementClient);

        for (const groupKeySetId of [1, 2]) {
            await cmds.keySetWrite({
                groupKeySet: {
                    groupKeySetId,
                    groupKeySecurityPolicy: 0,
                    epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime0: 18446744073709551612n,
                    epochKey1: Bytes.fromHex("d1d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime1: 18446744073709551613n,
                    epochKey2: Bytes.fromHex("d2d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                    epochStartTime2: 18446744073709551614n,
                },
            });
        }

        await device.act(agent => {
            agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                { fabricIndex: FabricIndex(1), groupId: GroupId(0x0101), groupKeySetId: 1 },
                { fabricIndex: FabricIndex(1), groupId: GroupId(0x0102), groupKeySetId: 2 },
            ];
        });

        await cmds.keySetRemove({ groupKeySetId: 1 });

        // Only the entry referencing the surviving key set 2 remains
        const groupKeyMap = device.stateOf(GroupKeyManagementServer).groupKeyMap;
        expect(groupKeyMap.map(({ groupId, groupKeySetId }) => ({ groupId, groupKeySetId }))).deep.equals([
            { groupId: 0x0102, groupKeySetId: 2 },
        ]);
    });

    it("clears the operational key map of a fabric whose last GroupKeyMap entry a local write removes", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint },
        });

        const cmds = controller.peers.get("peer1")!.commandsOf(GroupKeyManagementClient);
        await cmds.keySetWrite({
            groupKeySet: {
                groupKeySetId: 1,
                groupKeySecurityPolicy: 0,
                epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime0: 18446744073709551612n,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
            },
        });

        await device.act(agent => {
            agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                { fabricIndex: FabricIndex(1), groupId: GroupId(0x0101), groupKeySetId: 1 },
            ];
        });
        const { groups } = device.env.get(FabricManager).for(FabricIndex(1));
        expect([...groups.groupKeyIdMap.entries()]).deep.equals([[GroupId(0x0101), 1]]);

        await device.act(agent => {
            agent.get(GroupKeyManagementServer).state.groupKeyMap = [];
        });

        expect(groups.groupKeyIdMap.size).equals(0);
    });

    it("keeps the operational key map of a fabric whose entries a local write keeps", async () => {
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
        const fabric1 = await node.addFabric();
        const fabric2 = await node.addFabric();
        const entry = (fabricIndex: FabricIndex) => ({ fabricIndex, groupId: GroupId(0x0101), groupKeySetId: 1 });

        await node.act(agent => {
            agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                entry(fabric1.fabricIndex),
                entry(fabric2.fabricIndex),
            ];
        });
        await node.act(agent => {
            agent.get(GroupKeyManagementServer).state.groupKeyMap = [entry(fabric1.fabricIndex)];
        });

        const fabrics = node.env.get(FabricManager);
        expect([...fabrics.for(fabric1.fabricIndex).groups.groupKeyIdMap.entries()]).deep.equals([
            [GroupId(0x0101), 1],
        ]);
        expect(fabrics.for(fabric2.fabricIndex).groups.groupKeyIdMap.size).equals(0);
    });

    describe("FabricGroups sync", () => {
        const keySet = {
            groupKeySetId: 1,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
            epochStartTime0: 18446744073709551612n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        };

        /** An invalid GroupKeyMap that the validation at commit refuses, which rolls the whole transaction back. */
        const refusedAtCommit = (fabricIndex: FabricIndex) => [{ fabricIndex, groupId: GroupId(0), groupKeySetId: 1 }];

        /** A node with one fabric and an exchange whose session uses that fabric, as a CASE session does. */
        async function onlineNode(options?: MockServerNode.Options) {
            const node = await MockServerNode.createOnline(undefined, options);
            const { fabricIndex } = await node.addFabric();
            const fabric = node.env.get(FabricManager).for(fabricIndex);
            const exchange = new MockExchange(
                { fabricIndex, nodeId: NodeId(0n) },
                { session: new ProtocolMocks.NodeSession({ fabric, peerNodeId: NodeId(0n) }) },
            );
            return { node, fabricIndex, exchange, groups: fabric.groups };
        }

        it("leaves the key sets of the fabric unchanged when KeySetWrite fails at commit", async () => {
            const { node, fabricIndex, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;

            await expect(
                node.online({ exchange, command: true }, async agent => {
                    const gkm = agent.get(GroupKeyManagementServer);
                    await gkm.keySetWrite({ groupKeySet: keySet });
                    gkm.state.groupKeyMap = refusedAtCommit(fabricIndex);
                }),
            ).rejectedWith(/Only operational GroupIds/);

            expect(node.stateOf(GroupKeyManagementServer).groupKeySets).deep.equals([]);
            expect(groups.keySets.forId(1)).undefined;
        });

        it("keeps the key set of the fabric when KeySetRemove fails at commit", async () => {
            const { node, fabricIndex, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupKeyManagementServer).keySetWrite({ groupKeySet: keySet }),
            );
            expect(groups.keySets.forId(1)).not.undefined;

            await expect(
                node.online({ exchange, command: true }, async agent => {
                    const gkm = agent.get(GroupKeyManagementServer);
                    await gkm.keySetRemove({ groupKeySetId: 1 });
                    gkm.state.groupKeyMap = refusedAtCommit(fabricIndex);
                }),
            ).rejectedWith(/Only operational GroupIds/);

            expect(node.stateOf(GroupKeyManagementServer).groupKeySets).length(1);
            expect(groups.keySets.forId(1)).not.undefined;
        });

        it("keeps an unchanged key set installed when a later commit syncs the fabric", async () => {
            const { node, fabricIndex, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupKeyManagementServer).keySetWrite({ groupKeySet: keySet }),
            );
            const removed = new Array<number>();
            groups.keySets.deleted.on(({ groupKeySetId }) => void removed.push(groupKeySetId));

            await node.act(agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                    { fabricIndex, groupId: GroupId(0x0101), groupKeySetId: 1 },
                ];
            });

            expect(groups.groupKeyIdMap.get(GroupId(0x0101))).equals(1);
            expect(removed).deep.equals([]);
        });

        it("moves a group to its new key set before removing the old key set", async () => {
            const { node, fabricIndex, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;
            const groupId = GroupId(0x0101);
            await node.online({ exchange, command: true }, async agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                await gkm.keySetWrite({ groupKeySet: keySet });
                gkm.state.groupKeyMap = [{ fabricIndex, groupId, groupKeySetId: 1 }];
            });
            const mappedOnRemoval = new Array<number | undefined>();
            groups.keySets.deleted.on(() => void mappedOnRemoval.push(groups.groupKeyIdMap.get(groupId)));

            await node.online({ exchange, command: true }, async agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                await gkm.keySetWrite({ groupKeySet: { ...keySet, groupKeySetId: 2 } });
                gkm.state.groupKeyMap = [{ fabricIndex, groupId, groupKeySetId: 2 }];
                await gkm.keySetRemove({ groupKeySetId: 1 });
            });

            expect(groups.keySets.forId(1)).undefined;
            expect(mappedOnRemoval).deep.equals([2]);
        });

        it("adds no endpoint map entry when a Groups AddGroup fails at commit", async () => {
            // The default device has the Groups cluster on endpoint 1
            const { node, fabricIndex, exchange, groups } = await onlineNode();
            await using _node = node;
            const groupId = GroupId(0x0101);
            await node.act(agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [{ fabricIndex, groupId, groupKeySetId: 1 }];
            });
            expect(groups.groupKeyIdMap.has(groupId)).true;

            await expect(
                node.online({ exchange, command: true }, async agent => {
                    const light = node.parts.get(1)!.agentFor(agent.context);
                    const { status } = await light.get(GroupsServer).addGroup({ groupId, groupName: "" });
                    expect(status).equals(Status.Success);
                    agent.get(GroupKeyManagementServer).state.groupKeyMap = refusedAtCommit(fabricIndex);
                }),
            ).rejectedWith(/Only operational GroupIds/);

            expect(node.stateOf(GroupKeyManagementServer).groupTable).deep.equals([]);
            expect(groups.endpoints.has(groupId)).false;
        });

        it("keeps entries that other code wrote to the fabric when a commit syncs it", async () => {
            const { node, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;
            const foreignGroup = GroupId(0x0301);
            await groups.setFromGroupKeySet({ ...keySet, groupKeySetId: 9 });
            groups.groupKeyIdMap.set(foreignGroup, 9);
            groups.endpoints.set(foreignGroup, [EndpointNumber(1)]);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupKeyManagementServer).keySetWrite({ groupKeySet: keySet }),
            );

            expect(groups.keySets.forId(1)).not.undefined;
            expect(groups.keySets.forId(9)).not.undefined;
            expect(groups.groupKeyIdMap.get(foreignGroup)).equals(9);
            expect(groups.endpoints.get(foreignGroup)).deep.equals([EndpointNumber(1)]);
        });

        it("installs a key set that a local state write adds", async () => {
            const { node, fabricIndex, groups } = await onlineNode({ device: undefined });
            await using _node = node;

            await node.setStateOf(GroupKeyManagementServer, { groupKeySets: [{ ...keySet, fabricIndex }] });

            expect(groups.keySets.forId(1)).not.undefined;
        });

        it("refuses a key set whose first epoch key is disabled", async () => {
            const { node, exchange, groups } = await onlineNode({ device: undefined });
            await using _node = node;

            await expect(
                node.online({ exchange, command: true }, async agent =>
                    agent
                        .get(GroupKeyManagementServer)
                        .keySetWrite({ groupKeySet: { ...keySet, epochStartTime0: 0xffffffffffffffffn } }),
                ),
            ).rejectedWith(/EpochKey0 and EpochStartTime0 must be set/);

            expect(node.stateOf(GroupKeyManagementServer).groupKeySets).deep.equals([]);
            expect(groups.keySets.forId(1)).undefined;
        });

        it("drops stored key sets of a fabric that no longer exists when going online", async () => {
            await using node = await MockServerNode.createOnline(undefined, {
                device: undefined,
                groupKeyManagement: { groupKeySets: [{ ...keySet, fabricIndex: FabricIndex(7) }] },
            });

            expect(node.stateOf(GroupKeyManagementServer).groupKeySets).deep.equals([]);
        });
    });

    it("refuses group id 0 in GroupKeyMap", async () => {
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
        const fabric = await node.addFabric();

        let failure: unknown;
        try {
            await node.act(agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                    { fabricIndex: fabric.fabricIndex, groupId: GroupId(0), groupKeySetId: 1 },
                ];
            });
        } catch (error) {
            failure = error;
        }

        expect(failure)
            .property("message")
            .match(/Only operational GroupIds/);
        expect(node.stateOf(GroupKeyManagementServer).groupKeyMap).deep.equals([]);
    });
});
