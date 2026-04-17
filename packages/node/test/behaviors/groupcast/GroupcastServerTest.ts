/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupcastServer } from "#behaviors/groupcast";
import { AccessLevel } from "@matter/model";
import { FabricManager, IANA_GROUPCAST_MULTICAST_ADDRESS } from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import { MockExchange } from "../../node/mock-exchange.js";
import { MockServerNode } from "../../node/mock-server-node.js";

/** Root endpoint type with GroupcastServer (Listener+Sender+PerGroup) and GKM (GCAST feature) installed. */
const GroupcastRootEndpoint = MockServerNode.RootEndpoint.with(
    GroupcastServer.with("Listener", "Sender", "PerGroup"),
    GroupKeyManagementServer.with("Groupcast"),
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

            // TODO(IANA-WRAP): CHIP-compatible wrapped form; revert to "ff05::fa" when fixed upstream.
            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).equal("ff35:40:ff05::fa");
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
            // TODO(IANA-WRAP): comparing against wrapped IANA form; revert to "ff05::fa" when fixed.
            expect(addr).not.equal("ff35:40:ff05::fa");
            expect(addr).to.match(/^ff35:40:fd/i);
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

            // Verify the provider observable has the correct entries (plain JS object, no context needed)
            const gcastInternal = node.agentFor({ session: { fabricIndex: fi } as any } as any).get(GroupcastServer)
                .internal as unknown as { auxAcl: { value: unknown[] } };
            expect(gcastInternal.auxAcl.value.filter((e: any) => e.fabricIndex === fi)).to.have.length(1);
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
    });
});
