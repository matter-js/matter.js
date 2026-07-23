/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupcastServer } from "#behaviors/groupcast";
import { Environment, ipv6ToBytes } from "@matter/general";
import { AccessLevel } from "@matter/model";
import { FabricManager, IANA_GROUPCAST_MULTICAST_ADDRESS, SessionManager } from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, MATTER_EPOCH_OFFSET_US, NodeId } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import { MockExchange } from "../../node/mock-exchange.js";
import { MockServerNode } from "../../node/mock-server-node.js";

/** Root endpoint type with GroupcastServer (Listener+Sender+PerGroup), GKM (GCAST feature) and auxiliary ACLs. */
const GroupcastRootEndpoint = MockServerNode.RootEndpoint.with(
    GroupcastServer.with("Listener", "Sender", "PerGroup"),
    GroupKeyManagementServer.with("Groupcast"),
    AccessControlServer.with("Extension", "Auxiliary"),
);

/** 16-byte test key for creating key sets via JoinGroup/UpdateGroupKey. */
const TEST_KEY = new Uint8Array(16);

/** Helper to create an online MockServerNode with Groupcast cluster. */
async function createGroupcastNode() {
    return MockServerNode.createOnline(GroupcastRootEndpoint, { device: undefined });
}

/** Helper to build a MockExchange scoped to a specific fabric index. */
function fabricExchange(fabricIndex: FabricIndex, accessLevel = AccessLevel.Administer) {
    return new MockExchange({ fabricIndex, nodeId: NodeId(0n) }, { accessLevel });
}

describe("GroupcastServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("joinGroup", () => {
        it("adds a membership entry", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, async agent => {
                await agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                });
            });

            // Membership persisted in state
            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership).to.have.length(1);
            expect(membership[0].groupId).equal(0x0001);
            expect(membership[0].fabricIndex).equal(fi);
            expect(membership[0].keySetId).equal(1);
            expect(membership[0].mcastAddrPolicy).equal(Groupcast.MulticastAddrPolicy.IanaAddr);

            // FabricGroups updated with group→keySet mapping
            const realFabric = node.env.get(FabricManager).for(fi);
            expect(realFabric.groups.groupKeyIdMap.get(GroupId(0x0001))).equal(1);

            // IANA multicast policy applied
            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).equal("ff05::fa");
        });

        it("records groupProperties flags", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const entry = node.stateOf(GroupcastServer).groupProperties.find(p => p.groupId === 0x0102);
            expect(entry).not.equals(undefined);
            expect(entry!.fabricIndex).equals(fi);
            expect(entry!.mcastAddrPolicy).equals(Groupcast.MulticastAddrPolicy.IanaAddr);
            expect(entry!.hasAuxiliaryAcl).equals(false);
        });

        it("does not overwrite hasAuxiliaryAcl on a plain re-join", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    useAuxiliaryAcl: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // Re-join without useAuxiliaryAcl must not reset the flag to its default
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(2)],
                    keySetId: 1,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const entry = node.stateOf(GroupcastServer).groupProperties.find(p => p.groupId === 0x0102);
            expect(entry!.hasAuxiliaryAcl).equals(true);
        });

        it("rejects groups with invalid IDs (0 and > 0xFFF7)", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            const call = (groupId: number) =>
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(groupId),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            key: TEST_KEY,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                );

            await expect(call(0)).rejectedWith("Invalid group ID");
            await expect(call(0xfff8)).rejectedWith("Invalid group ID");
        });

        // KeySetID 0 rejection is enforced by model constraint "min 1" at the interaction layer

        it("rejects groups when KeySetId does not exist", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(0x0001),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 99, // does not exist and no key provided
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("not found");
        });

        it("requires Admin when key is provided", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            // Manage-level exchange: key field should trigger UnsupportedAccess
            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi, AccessLevel.Manage), command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(0x0001),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            key: TEST_KEY,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("Admin privilege");
        });

        it("merges endpoints when group already exists", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // Second join: same group, different endpoint, same keySetId (already exists from first call)
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(2)],
                    keySetId: 1,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership).to.have.length(1); // still one entry
            expect([...(membership[0].endpoints ?? [])].sort()).deep.equal([1, 2]);
        });

        it("replaces endpoints when replaceEndpoints=true", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1), EndpointNumber(2)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(3)],
                    keySetId: 1,
                    replaceEndpoints: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership[0].endpoints).deep.equal([3]);
        });

        it("uses PerGroup multicast policy when specified", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0002),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.PerGroup,
                }),
            );

            // FabricGroups should use per-group derived address (ff35: prefix)
            const realFabric = node.env.get(FabricManager).for(fi);
            const addr = realFabric.groups.multicastAddressFor(GroupId(0x0002));
            expect(addr).not.equal("ff05::fa");
            expect(addr).to.match(/^ff35:/i);
        });
    });

    describe("leaveGroup", () => {
        it("removes a membership entry and returns removed endpoints", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1), EndpointNumber(2)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const response = await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).leaveGroup({ groupId: GroupId(0x0001) }),
            );

            expect(response.groupId).equal(0x0001);
            // Response contains the REMOVED endpoints (the ones that were in the group)
            expect([...(response.endpoints ?? [])].sort()).deep.equal([1, 2]);
            expect(node.stateOf(GroupcastServer).membership).to.have.length(0);
        });

        it("removes groupProperties entry", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).leaveGroup({ groupId: GroupId(0x0102) }),
            );

            expect(node.stateOf(GroupcastServer).groupProperties.some(p => p.groupId === 0x0102)).equals(false);
        });

        it("leaves all groups of the fabric with the wildcard group id", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);
            const realFabric = node.env.get(FabricManager).for(fi);

            const join = (groupId: number, key?: Uint8Array) =>
                node.online({ exchange, command: true }, agent =>
                    agent.get(GroupcastServer).joinGroup({
                        groupId: GroupId(groupId),
                        endpoints: [EndpointNumber(1)],
                        keySetId: 1,
                        key,
                        mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                    }),
                );
            await join(0x0001, TEST_KEY);
            await join(0x0002);

            const response = await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).leaveGroup({ groupId: GroupId.NO_GROUP_ID }),
            );

            expect(response.groupId).equal(GroupId.NO_GROUP_ID);
            expect(node.stateOf(GroupcastServer).membership).to.have.length(0);
            expect(node.stateOf(GroupcastServer).groupProperties).to.have.length(0);
            expect(realFabric.groups.groupKeyIdMap.size).equal(0);
            expect(realFabric.groups.endpoints.size).equal(0);
        });

        it("removes only specified endpoints, keeps others", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1), EndpointNumber(2), EndpointNumber(3)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const response = await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).leaveGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                }),
            );

            // Response contains the REMOVED endpoints (only [1])
            expect(response.endpoints).deep.equal([1]);
            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership).to.have.length(1);
            expect([...(membership[0].endpoints ?? [])].sort()).deep.equal([2, 3]);
        });

        it("throws NotFound for an unknown group", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                        agent.get(GroupcastServer).leaveGroup({ groupId: GroupId(0x0099) }),
                    ),
                ),
            ).rejectedWith("not found");
        });
    });

    describe("updateGroupKey", () => {
        it("updates keySetId for an existing group", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // Create a second key set and update the group to use it
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).updateGroupKey({
                    groupId: GroupId(0x0001),
                    keySetId: 2,
                    key: TEST_KEY,
                }),
            );

            expect(node.stateOf(GroupcastServer).membership[0].keySetId).equal(2);
        });

        it("throws NotFound for an unknown group", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                        agent.get(GroupcastServer).updateGroupKey({
                            groupId: GroupId(0x0099),
                            keySetId: 1,
                        }),
                    ),
                ),
            ).rejectedWith("not found");
        });

        // KeySetID 0 rejection is enforced by model constraint "min 1" at the interaction layer
    });

    describe("configureAuxiliaryAcl", () => {
        it("sets hasAuxiliaryAcl on a membership entry", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // configureAuxiliaryAcl is a Listener feature command — cast to access it
            await node.online({ exchange, command: true }, agent =>
                (
                    agent.get(GroupcastServer) as unknown as {
                        configureAuxiliaryAcl: (r: Groupcast.ConfigureAuxiliaryAclRequest) => void;
                    }
                ).configureAuxiliaryAcl({ groupId: GroupId(0x0001), useAuxiliaryAcl: true }),
            );

            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership[0].hasAuxiliaryAcl).true;

            const props = node.stateOf(GroupcastServer).groupProperties.find(p => p.groupId === 0x0001);
            expect(props!.hasAuxiliaryAcl).true;

            // Verify the provider observable has the correct entries (plain JS object, no context needed)
            const gcastInternal = node.agentFor({ session: { fabricIndex: fi } as any } as any).get(GroupcastServer)
                .internal as unknown as { auxAcl: { value: unknown[] } };
            expect(gcastInternal.auxAcl.value.filter((e: any) => e.fabricIndex === fi)).to.have.length(1);

            // Verify the synthetic entry propagated into AccessControlServer state
            const auxiliaryAcl = node.stateOf(AccessControlServer).auxiliaryAcl;
            expect(auxiliaryAcl?.filter(e => e.fabricIndex === fi)).to.have.length(1);
        });

        it("rejects the Listener feature when AccessControl lacks the Auxiliary feature", async () => {
            const endpointType = MockServerNode.RootEndpoint.with(
                GroupcastServer.with("Listener", "Sender", "PerGroup"),
                GroupKeyManagementServer.with("Groupcast"),
            );
            await expect(MockServerNode.createOnline(endpointType, { device: undefined })).rejectedWith(
                "requires the AccessControl Auxiliary feature",
            );
        });
    });

    describe("GKM mirror", () => {
        it("propagates Membership keySetId mappings to GKM groupKeyMap", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const gkmMap = node.stateOf(GroupKeyManagementServer).groupKeyMap;
            expect(gkmMap.filter(e => e.fabricIndex === fi)).deep.equal([
                { groupId: 0x0001, groupKeySetId: 1, fabricIndex: fi },
            ]);

            // Auto-created key set has EpochStartTime0=1 per core§11.27.7.1.4 (internal times are unix-epoch based)
            const keySet = node
                .stateOf(GroupKeyManagementServer)
                .groupKeySets.find(ks => ks.fabricIndex === fi && ks.groupKeySetId === 1);
            expect(keySet?.epochStartTime0).equal(MATTER_EPOCH_OFFSET_US + BigInt(1));
        });

        it("preserves legacy group configuration not owned by Groupcast", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);
            const realFabric = node.env.get(FabricManager).for(fi);

            // Legacy configuration (Groups cluster / direct GKM writes), never joined via Groupcast
            await node.online({ exchange, command: true }, async agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                gkm.state.groupKeyMap = [{ groupId: GroupId(0x0300), groupKeySetId: 5, fabricIndex: fi }];
                gkm.state.groupTable = [
                    { groupId: GroupId(0x0300), endpoints: [EndpointNumber(1)], groupName: "Legacy", fabricIndex: fi },
                ];
            });
            await MockTime.yield3();

            // A Groupcast join of an unrelated group must not clobber the legacy configuration
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            await MockTime.yield3();

            const gkmState = node.stateOf(GroupKeyManagementServer);
            expect(gkmState.groupKeyMap.find(e => e.groupId === 0x0300)?.groupKeySetId).equal(5);
            expect(gkmState.groupKeyMap.find(e => e.groupId === 0x0001)?.groupKeySetId).equal(1);
            expect(gkmState.groupTable.find(e => e.groupId === 0x0300)?.groupName).equal("Legacy");

            // Joining the legacy group via Groupcast takes ownership but keeps its name
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0300),
                    endpoints: [EndpointNumber(2)],
                    keySetId: 1,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            await MockTime.yield3();
            expect(node.stateOf(GroupKeyManagementServer).groupTable.find(e => e.groupId === 0x0300)?.groupName).equal(
                "Legacy",
            );
            expect(realFabric.groups.endpoints.has(GroupId(0x0300))).equal(true);
        });

        it("shrinks Membership and auxiliary ACLs when groups are removed via the GKM group table", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    useAuxiliaryAcl: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            expect(node.stateOf(AccessControlServer).auxiliaryAcl?.filter(e => e.fabricIndex === fi)).to.have.length(1);

            // Legacy Groups commands operate on the GKM group table; removal must ripple into Membership + aux ACLs.
            // With the Sender feature enabled the entry survives as sender-only, matching leaveGroup.
            await node.online({ exchange, command: true }, async agent => {
                agent.get(GroupKeyManagementServer).state.groupTable = [];
            });
            await MockTime.yield3();

            const remaining = node.stateOf(GroupcastServer).membership.filter(m => m.fabricIndex === fi);
            expect(remaining).to.have.length(1);
            expect([...(remaining[0].endpoints ?? [])]).deep.equal([]);
            expect(remaining[0].keySetId).equal(1);
            expect(node.stateOf(AccessControlServer).auxiliaryAcl?.filter(e => e.fabricIndex === fi)).to.have.length(0);
        });

        it("membership KeySetId follows the GroupKeyMap link", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // Clearing GroupKeyMap severs the link: membership reports the unmapped sentinel
            await node.online({ exchange, command: true }, async agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [];
            });
            await MockTime.yield3();
            expect(node.stateOf(GroupcastServer).membership[0].keySetId).equal(0xffff);

            // Restoring the mapping restores the KeySetId
            await node.online({ exchange, command: true }, async agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                    { groupId: GroupId(0x0001), groupKeySetId: 1, fabricIndex: fi },
                ];
            });
            await MockTime.yield3();
            expect(node.stateOf(GroupcastServer).membership[0].keySetId).equal(1);
        });

        it("keeps unmapped groups out of the operational group key map", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);
            const realFabric = node.env.get(FabricManager).for(fi);

            const join = (groupId: number, endpoints: number[], key?: Uint8Array) =>
                node.online({ exchange, command: true }, agent =>
                    agent.get(GroupcastServer).joinGroup({
                        groupId: GroupId(groupId),
                        endpoints: endpoints.map(ep => EndpointNumber(ep)),
                        keySetId: 1,
                        key,
                        mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                    }),
                );
            await join(0x0001, [1], TEST_KEY);
            await join(0x0002, [1]);

            // Sever the GroupKeyMap link of group 2 only
            await node.online({ exchange, command: true }, async agent => {
                agent.get(GroupKeyManagementServer).state.groupKeyMap = [
                    { groupId: GroupId(0x0001), groupKeySetId: 1, fabricIndex: fi },
                ];
            });
            await MockTime.yield3();
            expect(node.stateOf(GroupcastServer).membership.find(m => m.groupId === 0x0002)?.keySetId).equal(0xffff);

            // An unrelated membership change re-syncs the fabric: the unmapped group must not reappear in the
            // operational key map pointing at the sentinel
            await join(0x0001, [1, 2]);
            await MockTime.yield3();
            expect(realFabric.groups.groupKeyIdMap.has(GroupId(0x0001))).equal(true);
            expect(realFabric.groups.groupKeyIdMap.has(GroupId(0x0002))).equal(false);

            // The group itself still exists, so it keeps receiving multicast (endpoints drive the membership)
            expect(realFabric.groups.endpoints.has(GroupId(0x0002))).equal(true);
        });

        it("Groupcast per-fabric cap aligns with GKM maxGroupsPerFabric", async () => {
            await using node = await createGroupcastNode();
            const gkmCap = node.stateOf(GroupKeyManagementServer).maxGroupsPerFabric;
            const gcMax = node.stateOf(GroupcastServer).maxMembershipCount;
            // Mirror won't trip GKM validator only if per-fabric quotas line up.
            expect(Math.floor(gcMax / 2)).equal(gkmCap);
        });

        it("mirror fills GKM up to maxGroupsPerFabric without tripping the validator", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            const gkmCap = node.stateOf(GroupKeyManagementServer).maxGroupsPerFabric;

            // First join creates the key set; subsequent joins reuse it
            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(1),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            // Fill exactly to gkmCap on this fabric
            for (let i = 2; i <= gkmCap; i++) {
                await node.online({ exchange, command: true }, agent =>
                    agent.get(GroupcastServer).joinGroup({
                        groupId: GroupId(i),
                        endpoints: [EndpointNumber(1)],
                        keySetId: 1,
                        mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                    }),
                );
            }

            expect(node.stateOf(GroupcastServer).membership.filter(m => m.fabricIndex === fi)).to.have.length(gkmCap);
            expect(node.stateOf(GroupKeyManagementServer).groupKeyMap.filter(e => e.fabricIndex === fi)).to.have.length(
                gkmCap,
            );

            // One more on this fabric trips Groupcast's per-fabric cap (BEFORE the mirror runs)
            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange, command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(gkmCap + 1),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("Per-fabric membership limit reached");
        });

        it("direct GKM attribute write still enforces maxGroupsPerFabric", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            const gkmCap = node.stateOf(GroupKeyManagementServer).maxGroupsPerFabric;
            const tooMany = Array.from({ length: gkmCap + 1 }, (_, i) => ({
                groupId: GroupId(i + 1),
                groupKeySetId: 1,
                fabricIndex: fi,
            }));

            await expect(
                node.online({ exchange: fabricExchange(fi), command: true }, async agent => {
                    agent.get(GroupKeyManagementServer).state.groupKeyMap = tooMany;
                }),
            ).rejectedWith("Too many groups per fabric");
        });
    });

    describe("endpoint mirror", () => {
        it("propagates Membership endpoints to GKM groupTable and FabricGroups.endpoints", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0103),
                    endpoints: [EndpointNumber(1), EndpointNumber(2)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const groupTable = node.stateOf(GroupKeyManagementServer).groupTable.filter(e => e.fabricIndex === fi);
            expect(groupTable).to.have.length(1);
            expect(groupTable[0].groupId).equal(0x0103);
            expect([...groupTable[0].endpoints].sort()).deep.equal([1, 2]);

            const realFabric = node.env.get(FabricManager).for(fi);
            expect(realFabric.groups.endpoints.get(GroupId(0x0103))).deep.equal([1, 2]);
        });

        it("removes endpoints from GKM groupTable and FabricGroups when group is left", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0103),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).leaveGroup({ groupId: GroupId(0x0103) }),
            );

            expect(node.stateOf(GroupKeyManagementServer).groupTable.filter(e => e.fabricIndex === fi)).to.have.length(
                0,
            );
            const realFabric = node.env.get(FabricManager).for(fi);
            expect(realFabric.groups.endpoints.has(GroupId(0x0103))).equal(false);
        });
    });

    describe("per-fabric quota", () => {
        it("rejects exceeding quota when another fabric is below quota", async () => {
            await using node = await createGroupcastNode();
            const f1 = await node.addFabric();
            // Add a second fabric so the spillover rule has another commissioned fabric to consider.
            await node.addFabric();

            const fi1 = f1.fabricIndex;
            const exchange = fabricExchange(fi1);
            const quota = Math.floor(node.stateOf(GroupcastServer).maxMembershipCount / 2);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(1),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            for (let i = 2; i <= quota; i++) {
                await node.online({ exchange, command: true }, agent =>
                    agent.get(GroupcastServer).joinGroup({
                        groupId: GroupId(i),
                        endpoints: [EndpointNumber(1)],
                        keySetId: 1,
                        mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                    }),
                );
            }

            // F1 at quota, F2 at 0 → F1 cannot exceed (F2 might still claim its quota).
            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange, command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(quota + 1),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("Per-fabric membership limit reached");
        });

        it("two fabrics each fill to quota using full M_max (even alignment, no spillover)", async () => {
            await using node = await createGroupcastNode();
            const f1 = await node.addFabric();
            const f2 = await node.addFabric();
            const ex1 = fabricExchange(f1.fabricIndex);
            const ex2 = fabricExchange(f2.fabricIndex);
            const max = node.stateOf(GroupcastServer).maxMembershipCount;
            const quota = Math.floor(max / 2);
            // Even alignment (M_max = 2*quota) avoids spillover semantics entirely.
            expect(2 * quota).equal(max);

            const fillFabric = async (exchange: ReturnType<typeof fabricExchange>, startId: number, count: number) => {
                for (let i = 0; i < count; i++) {
                    await node.online({ exchange, command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(startId + i),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            ...(i === 0 ? { key: TEST_KEY } : {}),
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    );
                }
            };

            await fillFabric(ex1, 1, quota);
            await fillFabric(ex2, quota + 1, quota);

            expect(node.stateOf(GroupcastServer).membership).to.have.length(max);

            // F1 already at quota → next on F1 trips per-fabric cap (without consulting other fabrics).
            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: ex1, command: true }, agent =>
                        agent.get(GroupcastServer).joinGroup({
                            groupId: GroupId(2 * quota + 1),
                            endpoints: [EndpointNumber(1)],
                            keySetId: 1,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("Per-fabric membership limit reached");
        });
    });

    describe("multicast policy ordering", () => {
        it("sets policy before groupKeyIdMap.added fires (listeners see correct address immediately)", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const realFabric = node.env.get(FabricManager).for(fi);

            let observedAddress: string | undefined;
            realFabric.groups.groupKeyIdMap.added.on(groupId => {
                observedAddress = realFabric.groups.multicastAddressFor(groupId);
            });

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            expect(observedAddress).equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
        });

        it("restores multicast policies when a fabric is replaced", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const fabrics = node.env.get(FabricManager);
            const realFabric = fabrics.for(fi);

            await node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).equal(IANA_GROUPCAST_MULTICAST_ADDRESS);

            // A replaced fabric arrives with a fresh Groups instance; simulate the policy loss and the event
            realFabric.groups.removeGroupMulticastPolicy(GroupId(0x0001));
            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).not.equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
            fabrics.events.replaced.emit(realFabric);
            await MockTime.yield3();

            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
        });
    });

    describe("groupcastTesting events", () => {
        it("derives multicast destination and source addresses for testing events", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                (
                    agent.get(GroupcastServer) as unknown as {
                        groupcastTesting: (r: Groupcast.GroupcastTestingRequest) => void;
                    }
                ).groupcastTesting({
                    testOperation: Groupcast.GroupcastTesting.EnableListenerTesting,
                    durationSeconds: 60,
                }),
            );

            const events = new Array<Groupcast.GroupcastTestingEvent>();
            node.eventsOf(GroupcastServer).groupcastTesting?.on(payload => {
                events.push(payload);
            });

            const sessions = node.env.get(SessionManager);
            const fabricObj = node.env.get(FabricManager).for(fi);

            // Authenticated success: destination derived from the group's multicast policy
            sessions.emitGroupMessage({
                result: Groupcast.GroupcastTestResult.Success,
                fabric: fabricObj,
                groupId: GroupId(0x0001),
                sourceIp: "fd00::1",
                endpointId: EndpointNumber(1),
                accessAllowed: true,
            });

            // Unauthenticated decode failure: destination derived from the header group id, no GroupID reported
            sessions.emitGroupMessage({
                result: Groupcast.GroupcastTestResult.NoAvailableKey,
                headerGroupId: GroupId(0x0001),
                sourceIp: "fe80::1%en0",
            });

            // Fully unknown key with a privacy-obfuscated header: no group id at all, IANA is the only
            // plausible arrival address
            sessions.emitGroupMessage({
                result: Groupcast.GroupcastTestResult.NoAvailableKey,
                sourceIp: "fd00::2",
            });

            await MockTime.yield3();

            expect(events).length(3);
            expect(events[2].groupcastTestResult).equal(Groupcast.GroupcastTestResult.NoAvailableKey);
            expect(events[2].groupId).equal(undefined);
            expect(events[2].destinationIpAddress).deep.equal(ipv6ToBytes(IANA_GROUPCAST_MULTICAST_ADDRESS));
            expect(events[0].groupcastTestResult).equal(Groupcast.GroupcastTestResult.Success);
            expect(events[0].groupId).equal(0x0001);
            expect(events[0].accessAllowed).true;
            expect(events[0].sourceIpAddress).deep.equal(ipv6ToBytes("fd00::1"));
            expect(events[0].destinationIpAddress).deep.equal(ipv6ToBytes(IANA_GROUPCAST_MULTICAST_ADDRESS));
            expect(events[1].groupcastTestResult).equal(Groupcast.GroupcastTestResult.NoAvailableKey);
            expect(events[1].groupId).equal(undefined);
            expect(events[1].sourceIpAddress).deep.equal(ipv6ToBytes("fe80::1"));
            expect(events[1].destinationIpAddress).deep.equal(ipv6ToBytes(IANA_GROUPCAST_MULTICAST_ADDRESS));
        });
    });

    describe("derived membership", () => {
        it("derives Membership from groupProperties + GKM tables", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 3,
                    key: TEST_KEY,
                    useAuxiliaryAcl: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            const m = node.stateOf(GroupcastServer).membership.find(x => x.groupId === 0x0102);
            expect(m).not.equals(undefined);
            expect(m!.endpoints).deep.equals([EndpointNumber(1)]);
            expect(m!.keySetId).equals(3);
            expect(m!.hasAuxiliaryAcl).equals(true);
            expect(m!.mcastAddrPolicy).equals(Groupcast.MulticastAddrPolicy.IanaAddr);
        });

        it("Membership survives reload via derived sources", async () => {
            const environment = new Environment("test");
            const node = await MockServerNode.createOnline(GroupcastRootEndpoint, {
                id: "groupcast-derive-reload",
                device: undefined,
                environment,
            });
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0102),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 3,
                    key: TEST_KEY,
                    useAuxiliaryAcl: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );
            const before = node.stateOf(GroupcastServer).membership;
            await node.close();

            const reloaded = await MockServerNode.createOnline(GroupcastRootEndpoint, {
                id: "groupcast-derive-reload",
                device: undefined,
                environment,
            });
            expect(reloaded.stateOf(GroupcastServer).membership).deep.equals(before);
            await reloaded.close();
        });

        it("Membership$Changed fires on join", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;
            const exchange = fabricExchange(fi, AccessLevel.Administer);

            let fired = false;
            node.eventsOf(GroupcastServer).membership$Changed.on(() => {
                fired = true;
            });

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: TEST_KEY,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            expect(fired).equals(true);
        });
    });

    describe("persistence", () => {
        it("persists groupProperties across reload", async () => {
            const environment = new Environment("test");
            const node = await MockServerNode.createOnline(GroupcastRootEndpoint, {
                id: "groupcast-persistence",
                device: undefined,
                environment,
            });
            const fabric = await node.addFabric();

            await node.online({ command: true }, agent => {
                agent.get(GroupcastServer).state.groupProperties = [
                    {
                        fabricIndex: fabric.fabricIndex,
                        groupId: GroupId(0x0101),
                        mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        hasAuxiliaryAcl: false,
                    },
                ];
            });

            await node.close();

            const reloaded = await MockServerNode.createOnline(GroupcastRootEndpoint, {
                id: "groupcast-persistence",
                device: undefined,
                environment,
            });
            expect(reloaded.stateOf(GroupcastServer).groupProperties).length(1);
            expect(reloaded.stateOf(GroupcastServer).groupProperties[0].groupId).equals(0x0101);
            await reloaded.close();
        });
    });
});
