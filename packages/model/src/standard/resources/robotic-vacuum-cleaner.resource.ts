/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RoboticVacuumCleaner", xref: "device§12.1",

    details: "This defines conformance for the Robotic Vacuum Cleaner device type." +
        "\n" +
        "### Cluster Usage" +
        "\n" +
        "This section describes how to control and monitor the operation of a Robotic Vacuum Cleaner device. " +
        "This information is meant to clarify how the data dependencies within the device type's cluster " +
        "composition are to be used." +
        "\n" +
        "Note that the device operations may also be the result of, or affected by, out-of-band actions such " +
        "as robot physical button presses, internally scheduled events, vendor application requests, commands " +
        "sent from other fabrics, internal device timeouts, etc. For example, a user may pause the robot " +
        "during cleaning by using a Matter client and then resume cleaning by using a physical button of the " +
        "device, or a robot may stop cleaning after an internal timeout occurs, and so forth." +
        "\n" +
        "The RVC Operational State cluster's OperationalState attribute shall be updated according to the " +
        "state of the device, and therefore it SHOULD be used for monitoring purposes. Note that while the " +
        "robot is in a cleaning cycle it may automatically seek the charger, recharge, and then resume " +
        "cleaning." +
        "\n" +
        "The sections below describe various operational flows with preconditions and actions. The behavior " +
        "in case the preconditions are not met is described in the corresponding cluster descriptions." +
        "\n" +
        "#### Starting Cleaning" +
        "\n" +
        "##### Preconditions" +
        "\n" +
        "If the DirectModeChange feature is not present, cleaning can only be started when the RVC Run Mode " +
        "cluster's CurrentMode attribute is set to a mode that has the Idle mode tag associated with it, and " +
        "the RVC Operational State cluster's OperationalState attribute is set to the Stopped, Paused, Docked " +
        "or Charging state." +
        "\n" +
        "Note that if the RVC Clean Mode cluster is implemented, it determines the type of cleaning." +
        "\n" +
        "##### Actions" +
        "\n" +
        "To attempt starting a cleaning operation, the RVC Run Mode cluster can be sent a ChangeToMode " +
        "command with the NewMode field set to a mode that has the Cleaning mode tag associated with it." +
        "\n" +
        "#### Pausing Cleaning" +
        "\n" +
        "##### Preconditions" +
        "\n" +
        "Cleaning can only be paused when the RVC Operational State cluster's OperationalState attribute is " +
        "set to a Pause-compatible state. See the Pause Compatibility table and the RVC Pause Compatibility " +
        "Table." +
        "\n" +
        "Note that even if the Pause command is not implemented, the RVC Operational State cluster's " +
        "OperationalState attribute may report that the device is in the Paused state due to an out-of-band " +
        "action, such as the user pressing a physical button on the device." +
        "\n" +
        "##### Actions" +
        "\n" +
        "To attempt pausing a cleaning operation, the RVC Operational State cluster can be sent a Pause " +
        "command." +
        "\n" +
        "#### Resuming Cleaning" +
        "\n" +
        "##### Preconditions" +
        "\n" +
        "Cleaning can only be resumed if the RVC Operational State cluster's OperationalState attribute is " +
        "set to a Resume-compatible state (see Resume Compatibility table and the RVC Resume Compatibility " +
        "table), and the RVC Run Mode cluster's CurrentMode is set to a mode with the Cleaning mode tag." +
        "\n" +
        "Note that even if the Resume command is not implemented, the RVC Operational State cluster's " +
        "OperationalState attribute may indicate that the device transitioned from the Paused state to the " +
        "Running state due to an out-of-band action, such as the user pressing a physical button on the " +
        "device." +
        "\n" +
        "##### Actions" +
        "\n" +
        "To attempt resuming a cleaning operation, the RVC Operational State cluster can be sent a Resume " +
        "command." +
        "\n" +
        "#### Stopping Cleaning" +
        "\n" +
        "##### Preconditions" +
        "\n" +
        "Stopping cleaning can only happen if the RVC Run Mode cluster's CurrentMode attribute is set to a " +
        "mode that has the Cleaning mode tag associated with it." +
        "\n" +
        "##### Actions" +
        "\n" +
        "To attempt stopping a cleaning operation, the RVC Run Mode cluster can be sent a ChangeToMode " +
        "command with the NewMode field set to a mode that has the Idle mode tag associated with it." +
        "\n" +
        "##### Side Effects" +
        "\n" +
        "Note that the device may seek the charger after successfully switching the RVC Run Mode cluster to " +
        "an Idle mode. The OperationalState attribute indicates whether the device is seeking the charger, " +
        "stopped, charging, docked etc." +
        "\n" +
        "#### Other Device Operations" +
        "\n" +
        "The RVC Run Mode cluster's SupportedModes attribute list may include modes that have neither the " +
        "Idle nor the Cleaning mode tags, for example the Mapping mode tag." +
        "\n" +
        "Starting, pausing, resuming and stopping these other operations have similar preconditions, actions " +
        "and side effects as those described above for the cleaning operations." +
        "\n" +
        "#### Device Error Handling" +
        "\n" +
        "When in an error condition, as indicated by the RVC Operational State cluster's OperationalState " +
        "attribute, out-of-band action will be required to clear that condition." +
        "\n" +
        "If an error occurs while the device operates, such as while cleaning or while mapping, the device " +
        "may pause and set the RVC Operational State cluster's OperationalState attribute to Error. If the " +
        "operation can be resumed after the error is cleared, the device shall set the RVC Operational State " +
        "cluster's OperationalState attribute to Paused and may be resumed either via a Resume command, if " +
        "implemented, or by out-of-band actions, such as by pressing the robot's physical buttons." +
        "\n" +
        "Note that certain errors may not pause or disable the device. For example, a dual-function device, " +
        "that can both vacuum and mop, may report a WaterTankEmpty error but may still be able to be used if " +
        "it has a vacuum only cleaning mode. Certain modes of the RVC Run Mode and the RVC Cleaning Mode " +
        "clusters may become unavailable and the ChangeToModeResponse commands' StatusCode shall be set to " +
        "InvalidInMode, when attempting to switch to those modes.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§12.1.4" },
        { tag: "requirement", name: "RvcRunMode", xref: "device§12.1.4" },
        { tag: "requirement", name: "RvcCleanMode", xref: "device§12.1.4" },
        {
            tag: "requirement", name: "RvcOperationalState", xref: "device§12.1.4",
            children: [{ tag: "requirement", name: "OperationCompletion", xref: "device§12.1.5" }]
        },
        { tag: "requirement", name: "ServiceArea", xref: "device§12.1.4" }
    ]
});
