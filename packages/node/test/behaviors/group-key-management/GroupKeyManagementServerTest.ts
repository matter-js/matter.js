/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementClient, GroupKeyManagementServer } from "#behaviors/group-key-management";
import { ServerNode } from "#node/index.js";
import { Bytes } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { FabricIndex, GroupId } from "@matter/types";

describe("GroupKeyManagementServer", () => {
    before(() => {
        MockTime.init();
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
});
