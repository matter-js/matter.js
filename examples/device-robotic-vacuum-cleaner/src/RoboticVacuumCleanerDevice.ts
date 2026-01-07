#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This demonstrates bringing a "Robotic Vacuum Cleaner" device online with matter.js.

import { AreaNamespaceTag, ServerNode } from "@matter/main";
import { ServiceAreaServer } from "@matter/main/behaviors/service-area";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { RvcCleanMode } from "@matter/main/clusters/rvc-clean-mode";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";
import { RvcRunMode } from "@matter/main/clusters/rvc-run-mode";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices/robotic-vacuum-cleaner";
import { CleaningAreas, RvcDeviceCleanMode, RvcDeviceLogic, RvcDeviceRunModes } from "./RvcDeviceLogic.js";
import { CustomRvcCleanModeServer } from "./behaviors/CustomRvcCleanModeServer.js";
import { CustomRvcOperationalStateServer } from "./behaviors/CustomRvcOperationalStateServer.js";
import { CustomRvcRunModeServer } from "./behaviors/CustomRvcRunModeServer.js";

// Physical devices appear as "nodes" on a Matter network.  As a device implementer you use a NodeServer to bring a
// device online.
//
// Note there are a large number of options to NodeServer that we are allowing to take default values here.  See
// IlluminatedRollerShade.ts for a more detailed example.
const node = await ServerNode.create();

// Nodes are a composition of endpoints.  Add a single endpoint to the node, our example RoboticVacuumCleanerDevice.
// THe RVC device has some requirements where multiple clusters need to work together.  We are using own Cluster logic
// for this - please see in the respective Behavior files.
// The below options also show the available Run Modes, Operational States and Service Areas that the device exposes
// and their data structures.

await node.add(
    RoboticVacuumCleanerDevice.with(
        CustomRvcCleanModeServer,
        CustomRvcOperationalStateServer,
        CustomRvcRunModeServer,
        ServiceAreaServer,
        RvcDeviceLogic,
    ),
    {
        id: "robotic-vacuum-cleaner",
        rvcCleanMode: {
            supportedModes: [
                {
                    label: "Vacuuming",
                    mode: RvcDeviceCleanMode.Vacuuming,
                    modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
                },
                {
                    label: "Mopping",
                    mode: RvcDeviceCleanMode.Mopping,
                    modeTags: [{ value: RvcCleanMode.ModeTag.Mop }],
                },
            ],
            // We start with this mode. It will be persisted
            currentMode: RvcDeviceCleanMode.Vacuuming,
        },
        rvcRunMode: {
            supportedModes: [
                {
                    label: "Auto-Cleaning",
                    mode: RvcDeviceRunModes.AutoCleaning,
                    modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }, { value: ModeBase.ModeTag.Auto }],
                },
                {
                    label: "Quick-Cleaning",
                    mode: RvcDeviceRunModes.QuickCleaning,
                    modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }, { value: ModeBase.ModeTag.Quick }],
                },
                {
                    label: "Mapping",
                    mode: RvcDeviceRunModes.Mapping,
                    modeTags: [{ value: RvcRunMode.ModeTag.Mapping }],
                },
                {
                    label: "Idle",
                    mode: RvcDeviceRunModes.Idle,
                    modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
                },
            ],
            // We start with this mode. It will be persisted
            currentMode: RvcDeviceRunModes.Idle,
        },
        rvcOperationalState: {
            operationalStateList: [
                { operationalStateId: RvcOperationalState.OperationalState.Running },
                { operationalStateId: RvcOperationalState.OperationalState.Paused },
                { operationalStateId: RvcOperationalState.OperationalState.Error },
                { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
                { operationalStateId: RvcOperationalState.OperationalState.Charging },
                { operationalStateId: RvcOperationalState.OperationalState.Docked },
            ],
            operationalState: RvcOperationalState.OperationalState.Docked,
        },
        serviceArea: {
            supportedAreas: [
                {
                    areaId: CleaningAreas.Kitchen,
                    mapId: null,
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
                    areaId: CleaningAreas.LivingRoom,
                    mapId: null,
                    areaInfo: {
                        locationInfo: {
                            locationName: "Living Room",
                            floorNumber: 0,
                            areaType: AreaNamespaceTag.LivingRoom.tag,
                        },
                        landmarkInfo: null,
                    },
                },
                {
                    areaId: CleaningAreas.Bathroom,
                    mapId: null,
                    areaInfo: {
                        locationInfo: {
                            locationName: "Bathroom",
                            floorNumber: 0,
                            areaType: AreaNamespaceTag.Bathroom.tag,
                        },
                        landmarkInfo: null,
                    },
                },
                {
                    areaId: CleaningAreas.Bedroom,
                    mapId: null,
                    areaInfo: {
                        locationInfo: {
                            locationName: "Bedroom",
                            floorNumber: 0,
                            areaType: AreaNamespaceTag.Bedroom.tag,
                        },
                        landmarkInfo: null,
                    },
                },
            ],
            currentArea: null,
        },
    },
);

// Our device is now built, so we can bring the node online.
//
// Note that you may serve multiple nodes from a single process.  We only have one, however, so we can use the run()
// method of the node.
await node.run();
