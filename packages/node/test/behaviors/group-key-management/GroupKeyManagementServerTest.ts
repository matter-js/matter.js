/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementClient } from "#behaviors/group-key-management";
import { Bytes } from "#general";
import { ServerNode } from "#node/index.js";
import { MockSite } from "../../node/mock-site.js";

describe("GroupKeyManagementServer", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
    });

    it("tries to add too many group keys", async () => {
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
});
