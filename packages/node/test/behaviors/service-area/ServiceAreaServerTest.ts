/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceAreaServer } from "#behaviors/service-area";
import { RvcOperationalState } from "#clusters/rvc-operational-state";
import { RvcRunMode } from "#clusters/rvc-run-mode";
import { RoboticVacuumCleanerDevice } from "#devices/robotic-vacuum-cleaner";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AreaNamespaceTag } from "#tags/index.js";
import { MockServerNode } from "../../node/mock-server-node.js";

const DeviceType = RoboticVacuumCleanerDevice.with(ServiceAreaServer.with("Maps", "SelectWhileRunning"));

async function createNode(options?: Endpoint.Options<typeof DeviceType>) {
    const node = await MockServerNode.create();
    if (!options) {
        options = {};
    }

    const rvcRunMode = options.rvcRunMode ?? {};
    options.rvcRunMode = {
        supportedModes: [
            {
                label: "Idle",
                mode: 0,
                modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
            },
            {
                label: "Cleaning",
                mode: 1,
                modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
            },
        ],
        currentMode: 0,
        ...rvcRunMode,
    };

    const rvcOperationalState = options.rvcOperationalState ?? {};
    options.rvcOperationalState = {
        operationalStateList: [{ operationalStateId: RvcOperationalState.OperationalState.Error }],
        operationalState: RvcOperationalState.OperationalState.Error,
        ...rvcOperationalState,
    };

    const endpoint = await node.add(DeviceType, options);

    return { node, endpoint };
}

describe("ServiceAreaServer", () => {
    it("allows undefined estimatedEndTime", async () => {
        await createNode({
            serviceArea: {
                estimatedEndTime: undefined,
            },
        });
    });

    it("allows empty estimatedEndTime", async () => {
        await createNode();
    });

    it("correctly validate supportedAreas", async () => {
        await createNode({
            serviceArea: {
                supportedMaps: [
                    {
                        mapId: 1,
                        name: "Ground floor",
                    },
                    {
                        mapId: 2,
                        name: "First floor",
                    },
                ],

                supportedAreas: [
                    {
                        areaId: 1,
                        mapId: 1,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Living",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.LivingRoom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 2,
                        mapId: 3,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Kitchen",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.Kitchen.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 3,
                        mapId: 2,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Bedroom",
                                floorNumber: 1,
                                areaType: AreaNamespaceTag.Bedroom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 4,
                        mapId: 2,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Bathroom",
                                floorNumber: 1,
                                areaType: AreaNamespaceTag.Bathroom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                ],
            },
        });
    });

    it("rejects with invalid supportedAreas", async () => {
        await expect(
            createNode({
                serviceArea: {
                    supportedMaps: [
                        {
                            mapId: 1,
                            name: "Ground floor",
                        },
                        {
                            mapId: 2,
                            name: "First floor",
                        },
                    ],

                    supportedAreas: [
                        {
                            areaId: 1,
                            mapId: 1,
                            areaInfo: {
                                locationInfo: {
                                    locationName: "Living",
                                    floorNumber: 0,
                                    areaType: AreaNamespaceTag.LivingRoom.tag,
                                },
                                landmarkInfo: null,
                            },
                        },
                        {
                            areaId: 2,
                            mapId: 3,
                            areaInfo: {
                                locationInfo: {
                                    locationName: "Kitchen",
                                    floorNumber: 0,
                                    areaType: AreaNamespaceTag.Kitchen.tag,
                                },
                                landmarkInfo: null,
                            },
                        },
                        {
                            areaId: 3,
                            mapId: 2,
                            areaInfo: {
                                locationInfo: {
                                    locationName: "Bedroom",
                                    floorNumber: 1,
                                    areaType: AreaNamespaceTag.Bedroom.tag,
                                },
                                landmarkInfo: null,
                            },
                        },
                        {
                            areaId: 4,
                            mapId: 2,
                            areaInfo: {
                                locationInfo: {
                                    locationName: "Bedroom",
                                    floorNumber: 1,
                                    areaType: AreaNamespaceTag.Bedroom.tag,
                                },
                                landmarkInfo: null,
                            },
                        },
                    ],
                },
            }),
        ).rejectedWith("Behaviors have errors");
    });
});
