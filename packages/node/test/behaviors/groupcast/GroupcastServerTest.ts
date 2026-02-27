/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupcastServer } from "#behaviors/groupcast";
import { Groupcast } from "#clusters/groupcast";
import { AccessLevel } from "#model";
import { FabricManager } from "#protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId } from "#types";
import { MockExchange } from "../../node/mock-exchange.js";
import { MockServerNode } from "../../node/mock-server-node.js";

/** Root endpoint type with GroupcastServer (Listener+Sender+PerGroup) and GKM (GCAST feature) installed. */
const GroupcastRootEndpoint = MockServerNode.RootEndpoint.with(
    GroupcastServer.with("Listener", "Sender", "PerGroup"),
    GroupKeyManagementServer.with("Groupcast"),
);

/** Helper to create an online MockServerNode with Groupcast cluster. */
async function createGroupcastNode() {
    return MockServerNode.createOnline(GroupcastRootEndpoint, { device: undefined });
}

/** Helper to build a MockExchange scoped to a specific fabric index. */
function fabricExchange(fabricIndex: FabricIndex, accessLevel = AccessLevel.Operate) {
    return new MockExchange({ fabricIndex, nodeId: NodeId(0n) }, { accessLevel });
}

describe("GroupcastServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("joinGroup", () => {
        it("adds a membership entry and marks fabric as adopted", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await node.online({ exchange: fabricExchange(fi), command: true }, async agent => {
                await agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(1)],
                    keySetId: 0, // IPK always valid
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                });
            });

            // Membership persisted in state
            const membership = node.stateOf(GroupcastServer).membership;
            expect(membership).to.have.length(1);
            expect(membership[0].groupId).equal(0x0001);
            expect(membership[0].fabricIndex).equal(fi);
            expect(membership[0].keySetId).equal(0);
            expect(membership[0].mcastAddrPolicy).equal(Groupcast.MulticastAddrPolicy.IanaAddr);

            // Fabric marked as adopted in GKM
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gkmState = node.stateOf(GroupKeyManagementServer) as any;
            expect(
                gkmState.groupcastAdoption?.some(
                    (e: { fabricIndex: FabricIndex; groupcastAdopted: boolean }) =>
                        e.fabricIndex === fi && e.groupcastAdopted,
                ),
            ).true;

            // FabricGroups updated with group→keySet mapping
            const realFabric = node.env.get(FabricManager).for(fi);
            expect(realFabric.groups.groupKeyIdMap.get(GroupId(0x0001))).equal(0);

            // IANA multicast policy applied
            expect(realFabric.groups.multicastAddressFor(GroupId(0x0001))).equal("ff05::fa");
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
                            keySetId: 0,
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                );

            await expect(call(0)).rejectedWith("Invalid group ID");
            await expect(call(0xfff8)).rejectedWith("Invalid group ID");
        });

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
                            keySetId: 99, // does not exist
                            mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                        }),
                    ),
                ),
            ).rejectedWith("not found");
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
                    keySetId: 0,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(2)],
                    keySetId: 0,
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
                    keySetId: 0,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).joinGroup({
                    groupId: GroupId(0x0001),
                    endpoints: [EndpointNumber(3)],
                    keySetId: 0,
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
                    keySetId: 0,
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
                    keySetId: 0,
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
                    keySetId: 0,
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
                    keySetId: 0,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                }),
            );

            await node.online({ exchange, command: true }, agent =>
                agent.get(GroupcastServer).updateGroupKey({ groupId: GroupId(0x0001), keySetId: 0 }),
            );

            // keySetId stays 0 (same in this case, but verifies the path works without error)
            expect(node.stateOf(GroupcastServer).membership[0].keySetId).equal(0);
        });

        it("throws NotFound for an unknown group", async () => {
            await using node = await createGroupcastNode();
            const fabric = await node.addFabric();
            const fi = fabric.fabricIndex;

            await expect(
                Promise.resolve().then(() =>
                    node.online({ exchange: fabricExchange(fi), command: true }, agent =>
                        agent.get(GroupcastServer).updateGroupKey({ groupId: GroupId(0x0099), keySetId: 0 }),
                    ),
                ),
            ).rejectedWith("not found");
        });
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
                    keySetId: 0,
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
});
