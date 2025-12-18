/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { ScenesManagementClient } from "#behaviors/scenes-management";
import { OnOff } from "#clusters/on-off";
import { ServerNode } from "#node/index.js";
import { Read } from "#protocol";
import { AttributeId, ClusterId, EndpointNumber, GroupId } from "#types";
import { MockSite } from "../../node/mock-site.js";

describe("ScenesManagementServer", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
    });

    it("add and recall onoff boolean scene value", async () => {
        await using site = new MockSite();
        // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
            },
        });

        // Get the client view of the device (peer)
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const onoff = peer1.endpoints.for(EndpointNumber(1));
        // Ensure off
        await onoff.commandsOf(OnOffClient).off();

        const cmds = onoff.commandsOf(ScenesManagementClient);

        await cmds.addScene({
            groupId: GroupId(0),
            sceneId: 1,
            transitionTime: 1000,
            sceneName: "Scene1",
            extensionFieldSetStructs: [
                { clusterId: ClusterId(6), attributeValueList: [{ attributeId: AttributeId(0), valueUnsigned8: 1 }] },
            ],
        });

        await cmds.recallScene({ groupId: GroupId(0), sceneId: 1 });

        await MockTime.advance(2000);

        const read = peer1.interaction.read(
            Read(
                Read.Attribute({
                    endpoint: EndpointNumber(1),
                    cluster: OnOff.Complete,
                    attributes: ["onOff"],
                }),
            ),
        );

        for await (const chunks of read) {
            expect((chunks as Array<any>)[0].value);
        }
    });
});
