/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "RvcOperationalState", classification: "application", pics: "RVCOPSTATE",
    xref: "cluster§7.4",
    details: "This cluster is derived from the Operational State cluster and provides an interface for monitoring " +
        "the operational state of a robotic vacuum cleaner.",

    children: [
        { tag: "command", name: "Pause", xref: "cluster§7.4.5" },
        { tag: "command", name: "Stop", xref: "cluster§7.4.5" },
        { tag: "command", name: "Start", xref: "cluster§7.4.5" },
        { tag: "command", name: "Resume", xref: "cluster§7.4.5" },
        { tag: "command", name: "OperationalCommandResponse", xref: "cluster§7.4.5" },

        {
            tag: "command", name: "GoHome", xref: "cluster§7.4.5.1",

            details: "On receipt of this command, the device shall start seeking the charging dock, if possible in the " +
                "current state of the device." +
                "\n" +
                "If this command is received when already in the SeekingCharger state the device shall respond with " +
                "an OperationalCommandResponse command with an ErrorStateID of NoError but the command shall have no " +
                "other effect." +
                "\n" +
                "A device that receives this command in any state which does not allow seeking the charger, such as " +
                "Charging or Docked, shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "CommandInvalidInState and shall have no other effect." +
                "\n" +
                "Otherwise, on success:" +
                "\n" +
                "  • The OperationalState attribute shall be set to SeekingCharger." +
                "\n" +
                "  • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "    NoError."
        },

        {
            tag: "datatype", name: "OperationalStateEnum", xref: "cluster§7.4.4.1",

            details: "The values defined herein are applicable to this derived cluster of Operational State only and are " +
                "additional to the set of values defined in Operational State itself." +
                "\n" +
                "RVC Pause Compatibility defines the compatibility of the states this cluster defines with the Pause " +
                "command." +
                "\n" +
                "### Table 13. RVC Pause Compatibility" +
                "\n" +
                "RVC Resume Compatibility defines the compatibility of the states this cluster defines with the " +
                "Resume command." +
                "\n" +
                "### Table 14. RVC Resume Compatibility" +
                "\n" +
                "While in the Charging or Docked states, the device shall NOT attempt to resume unless it " +
                "transitioned to those states while operating and can resume, such as, for example, if it is " +
                "recharging while in a cleaning cycle. Else, if the operational state is Charging or Docked but " +
                "there’s no operation to resume or the operation can’t be resumed, the device shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState but take no further " +
                "action.",

            children: [
                { tag: "field", name: "Stopped", description: "The device is stopped" },
                { tag: "field", name: "Running", description: "The device is operating" },
                { tag: "field", name: "Paused", description: "The device is paused during an operation" },
                { tag: "field", name: "Error", description: "The device is in an error state" },
                { tag: "field", name: "SeekingCharger", description: "The device is en route to the charging dock" },
                { tag: "field", name: "Charging", description: "The device is charging" },
                { tag: "field", name: "Docked", description: "The device is on the dock, not charging" },
                {
                    tag: "field", name: "EmptyingDustBin",
                    description: "The device is automatically emptying its own dust bin, such as to a dock"
                },
                {
                    tag: "field", name: "CleaningMop",
                    description: "The device is automatically cleaning its own mopping device, such as on a dock"
                },
                {
                    tag: "field", name: "FillingWaterTank",
                    description: "The device is automatically filling its own clean water tank for use when mopping, such as from a dock"
                },
                {
                    tag: "field", name: "UpdatingMaps",
                    description: "The device is processing acquired data to update its maps"
                }
            ]
        },

        {
            tag: "datatype", name: "ErrorStateEnum", xref: "cluster§7.4.4.2",
            details: "The values defined herein are applicable to this derived cluster of Operational State only and are " +
                "additional to the set of values defined in Operational State itself.",

            children: [
                { tag: "field", name: "NoError", description: "The device is not in an error state" },
                {
                    tag: "field", name: "UnableToStartOrResume",
                    description: "The device is unable to start or resume operation"
                },
                {
                    tag: "field", name: "UnableToCompleteOperation",
                    description: "The device was unable to complete the current operation"
                },
                {
                    tag: "field", name: "CommandInvalidInState",
                    description: "The device cannot process the command in its current state"
                },
                {
                    tag: "field", name: "FailedToFindChargingDock",
                    description: "The device has failed to find or reach the charging dock"
                },
                { tag: "field", name: "Stuck", description: "The device is stuck and requires manual intervention" },
                {
                    tag: "field", name: "DustBinMissing",
                    description: "The device has detected that its dust bin is missing"
                },
                { tag: "field", name: "DustBinFull", description: "The device has detected that its dust bin is full" },
                {
                    tag: "field", name: "WaterTankEmpty",
                    description: "The device has detected that its clean water tank is empty"
                },
                {
                    tag: "field", name: "WaterTankMissing",
                    description: "The device has detected that its clean water tank is missing"
                },
                {
                    tag: "field", name: "WaterTankLidOpen",
                    description: "The device has detected that its water tank lid is open"
                },
                {
                    tag: "field", name: "MopCleaningPadMissing",
                    description: "The device has detected that its cleaning pad is missing"
                },
                {
                    tag: "field", name: "LowBattery",
                    description: "The device is unable to start or to continue operating due to a low battery"
                },
                {
                    tag: "field", name: "CannotReachTargetArea",
                    description: "The device is unable to move to an area where it was asked to operate, such as by setting the ServiceArea cluster’s SelectedAreas attribute, due to an obstruction. For example, the obstruction might be a closed door or objects blocking the mapped path."
                },
                {
                    tag: "field", name: "DirtyWaterTankFull",
                    description: "The device has detected that its dirty water tank is full"
                },
                {
                    tag: "field", name: "DirtyWaterTankMissing",
                    description: "The device has detected that its dirty water is missing"
                },
                {
                    tag: "field", name: "WheelsJammed",
                    description: "The device has detected that one or more wheels are jammed by an object"
                },
                {
                    tag: "field", name: "BrushJammed",
                    description: "The device has detected that its brush is jammed by an object"
                },
                {
                    tag: "field", name: "NavigationSensorObscured",
                    description: "The device has detected that one of its sensors, such as LiDAR, infrared, or camera is obscured and needs to be cleaned"
                }
            ]
        }
    ]
});
