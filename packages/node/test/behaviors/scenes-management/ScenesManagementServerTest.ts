/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { ScenesManagementClient, ScenesManagementServer } from "#behaviors/scenes-management";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { ServerNode } from "#node/index.js";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { Read } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, FabricIndex, GroupId, Status } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

describe("ScenesManagementServer", () => {
    before(() => {
        MockTime.init();
    });

    it("add and recall onoff boolean scene value", async () => {
        await using site = new MockSite();
        // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
            },
        });

        // Get the client view of the device (peer)
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const onoff = peer1.endpoints.for(EndpointNumber(1));
        // Ensure off
        await MockTime.resolve(onoff.commandsOf(OnOffClient).off());

        const cmds = onoff.commandsOf(ScenesManagementClient);

        expect(
            await MockTime.resolve(
                cmds.addScene({
                    groupId: GroupId(0),
                    sceneId: 1,
                    transitionTime: 1000,
                    sceneName: "Scene1",
                    extensionFieldSetStructs: [
                        {
                            clusterId: ClusterId(6),
                            attributeValueList: [{ attributeId: AttributeId(0), valueUnsigned8: 1 }],
                        },
                    ],
                }),
            ),
        ).deep.equals({ status: 0, groupId: GroupId(0), sceneId: 1 });

        expect(
            await MockTime.resolve(
                cmds.addScene({
                    groupId: GroupId(0),
                    sceneId: 2,
                    transitionTime: 60000000,
                    sceneName: "Scene2",
                    extensionFieldSetStructs: [
                        {
                            clusterId: ClusterId(6),
                            attributeValueList: [{ attributeId: AttributeId(0), valueUnsigned8: 1 }],
                        },
                    ],
                }),
            ),
        ).deep.equals({ status: 0, groupId: GroupId(0), sceneId: 2 });

        const waiter = MockTime.resolve(device.endpoints.for(1).eventsOf(OnOffServer).onOff$Changed);

        await MockTime.resolve(cmds.recallScene({ groupId: GroupId(0), sceneId: 1 }));

        await MockTime.advance(1500);

        await waiter;

        await MockTime.resolve(
            (async () => {
                const read = peer1.interaction.read(
                    Read(
                        Read.Attribute({
                            endpoint: EndpointNumber(1),
                            cluster: OnOff,
                            attributes: ["onOff"],
                        }),
                    ),
                );

                for await (const chunks of read) {
                    expect((chunks as Array<any>)[0].value).equals(true);
                }
            })(),
        );
    });

    it("limits a fabric's remaining capacity by the entries other fabrics use", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
            },
        });
        const deviceEp = device.endpoints.for(1);
        const cmds = controller.peers.get("peer1")!.endpoints.for(EndpointNumber(1)).commandsOf(ScenesManagementClient);

        // Another fabric fills the table up to three free entries, far fewer than this fabric's own share
        const sceneTableSize = deviceEp.stateOf(ScenesManagementServer).sceneTableSize;
        await MockTime.resolve(
            deviceEp.setStateOf(ScenesManagementServer, {
                sceneTable: Array.from({ length: sceneTableSize - 3 }, (_, sceneId) => ({
                    sceneGroupId: GroupId(0),
                    sceneId,
                    sceneTransitionTime: 0,
                    sceneValues: {},
                    fabricIndex: FabricIndex(2),
                })),
            }),
        );

        const membership = await MockTime.resolve(cmds.getSceneMembership({ groupId: GroupId(0) }));
        expect(membership.capacity).equals(3);

        const addScene = (sceneId: number) =>
            MockTime.resolve(
                cmds.addScene({
                    groupId: GroupId(0),
                    sceneId,
                    transitionTime: 0,
                    sceneName: "",
                    extensionFieldSetStructs: [],
                }),
            );
        for (const sceneId of [1, 2, 3]) {
            expect((await addScene(sceneId)).status).equals(Status.Success);
        }
        expect((await addScene(4)).status).equals(Status.ResourceExhausted);
    });

    it("removes the scenes of a removed fabric and returns their entries to the other fabrics", async () => {
        await using node = await MockServerNode.createOnline();
        const removed = await node.addFabric();
        const kept = await node.addFabric();
        const ep = node.endpoints.for(1);
        const { sceneTableSize } = ep.stateOf(ScenesManagementServer);

        const sceneOfKept = {
            sceneGroupId: GroupId(0),
            sceneId: 1,
            sceneTransitionTime: 0,
            sceneValues: {},
            fabricIndex: kept.fabricIndex,
        };
        await ep.setStateOf(ScenesManagementServer, {
            sceneTable: [
                sceneOfKept,
                ...Array.from({ length: sceneTableSize - 4 }, (_, sceneId) => ({
                    sceneGroupId: GroupId(0),
                    sceneId,
                    sceneTransitionTime: 0,
                    sceneValues: {},
                    fabricIndex: removed.fabricIndex,
                })),
            ],
        });
        await ep.act(agent =>
            agent.get(ScenesManagementServer).removeScenesForGroupOnFabric(kept.fabricIndex, GroupId(1)),
        );
        const remainingOfKept = () =>
            ep.stateOf(ScenesManagementServer).fabricSceneInfo.find(info => info.fabricIndex === kept.fabricIndex)
                ?.remainingCapacity;
        expect(remainingOfKept()).equals(3);

        await MockTime.resolve(removed.delete());

        expect(
            ep.stateOf(ScenesManagementServer).sceneTable.map(({ fabricIndex, sceneId }) => ({ fabricIndex, sceneId })),
        ).deep.equals([{ fabricIndex: kept.fabricIndex, sceneId: 1 }]);
        expect(remainingOfKept()).equals(Math.floor((sceneTableSize - 1) / 2) - 1);
    });

    it("removes the scenes of fabrics that no longer exist at startup", async () => {
        await using node = await MockServerNode.createOnline(undefined, {
            device: new Endpoint(OnOffLightDevice, {
                scenesManagement: {
                    sceneTable: [
                        {
                            sceneGroupId: GroupId(0),
                            sceneId: 1,
                            sceneTransitionTime: 0,
                            sceneValues: {},
                            fabricIndex: FabricIndex(1),
                        },
                    ],
                },
            }),
        });

        expect(node.endpoints.for(1).stateOf(ScenesManagementServer).sceneTable).deep.equals([]);
    });
});
