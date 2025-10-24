/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "OperationalState", classification: "application", pics: "OPSTATE",
    xref: "cluster§1.14",

    details: "This cluster supports remotely monitoring and, where supported, changing the operational state of " +
        "any device where a state machine is a part of the operation." +
        "\n" +
        "This cluster defines common states, scoped to this cluster (e.g. Stopped, Running, Paused, Error). A " +
        "derived cluster specification may define more states scoped to the derivation. Manufacturer specific " +
        "states are supported in this cluster and any derived clusters thereof. When defined in a derived " +
        "instance, such states are scoped to the derivation." +
        "\n" +
        "Actual state transitions are dependent on both the implementation, and the requirements that may " +
        "additionally be imposed by a derived cluster." +
        "\n" +
        "An implementation that supports remotely starting its operation can make use of this cluster’s Start " +
        "command to do so. A device that supports remote pause or stop of its currently selected operation " +
        "can similarly make use of this cluster’s Pause and Stop commands to do so. The ability to remotely " +
        "pause or stop is independent of how the operation was started (for example, an operation started by " +
        "using a manual button press can be stopped by using a Stop command if the device supports remotely " +
        "stopping the operation)." +
        "\n" +
        "Additionally, this cluster provides events for monitoring the operational state of the device.",

    children: [
        {
            tag: "attribute", name: "PhaseList", xref: "cluster§1.14.5.1",

            details: "Indicates a list of names of different phases that the device can go through for the selected " +
                "function or mode. The list may not be in sequence order. For example in a washing machine this could " +
                "include items such as \"pre-soak\", \"rinse\", and \"spin\". These phases are manufacturer specific and " +
                "may change when a different function or mode is selected." +
                "\n" +
                "A null value indicates that the device does not present phases during its operation. When this " +
                "attribute’s value is null, the CurrentPhase attribute shall also be set to null."
        },

        {
            tag: "attribute", name: "CurrentPhase", xref: "cluster§1.14.5.2",

            details: "This attribute represents the current phase of operation being performed by the server. This shall " +
                "be the positional index representing the value from the set provided in the PhaseList Attribute, " +
                "where the first item in that list is an index of 0. Thus, this attribute shall have a maximum value " +
                "that is \"length(PhaseList) - 1\"." +
                "\n" +
                "Null if the PhaseList attribute is null or if the PhaseList attribute is an empty list."
        },

        {
            tag: "attribute", name: "CountdownTime", xref: "cluster§1.14.5.3",

            details: "Indicates the estimated time left before the operation is completed, in seconds." +
                "\n" +
                "A value of 0 (zero) means that the operation has completed." +
                "\n" +
                "A value of null represents that there is no time currently defined until operation completion. This " +
                "may happen, for example, because no operation is in progress or because the completion time is " +
                "unknown." +
                "\n" +
                "Changes to this attribute shall only be marked as reportable in the following cases:" +
                "\n" +
                "  • If it has changed due to a change in the CurrentPhase or OperationalState attributes, or" +
                "\n" +
                "  • When it changes from 0 to any other value and vice versa, or" +
                "\n" +
                "  • When it changes from null to any other value and vice versa, or" +
                "\n" +
                "  • When it increases, or" +
                "\n" +
                "  • When there is any increase or decrease in the estimated time remaining that was due to " +
                "    progressing insight of the server’s control logic, or" +
                "\n" +
                "  • When it changes at a rate significantly different from one unit per second." +
                "\n" +
                "Changes to this attribute merely due to the normal passage of time with no other dynamic change of " +
                "device state shall NOT be reported." +
                "\n" +
                "As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the " +
                "reporting of this attribute in order to keep track of the remaining duration."
        },

        {
            tag: "attribute", name: "OperationalStateList", xref: "cluster§1.14.5.4",

            details: "This attribute describes the set of possible operational states that the device exposes. An " +
                "operational state is a fundamental device state such as Running or Error. Details of the phase of a " +
                "device when, for example, in a state of Running are provided by the CurrentPhase attribute." +
                "\n" +
                "All devices shall, at a minimum, expose the set of states matching the commands that are also " +
                "supported by the cluster instance, in addition to Error. The set of possible device states are " +
                "defined in the OperationalStateEnum. A device type requiring implementation of this cluster shall " +
                "define the set of states that are applicable to that specific device type."
        },

        {
            tag: "attribute", name: "OperationalState", xref: "cluster§1.14.5.5",
            details: "This attribute specifies the current operational state of a device. This shall be populated with a " +
                "valid OperationalStateID from the set of values in the OperationalStateList Attribute."
        },

        {
            tag: "attribute", name: "OperationalError", xref: "cluster§1.14.5.6",
            details: "This attribute shall specify the details of any current error condition being experienced on the " +
                "device when the OperationalState attribute is populated with Error. See Section 1.14.4.4, " +
                "“ErrorStateStruct Type” for general requirements on the population of this attribute." +
                "\n" +
                "When there is no error detected, this shall have an ErrorStateID of NoError."
        },

        {
            tag: "event", name: "OperationalError", xref: "cluster§1.14.7.1",
            details: "This event is generated when a reportable error condition is detected. A device that generates this " +
                "event shall also set the OperationalState attribute to Error, indicating an error condition." +
                "\n" +
                "This event shall contain the following fields:"
        },

        {
            tag: "event", name: "OperationCompletion", xref: "cluster§1.14.7.2",

            details: "This event SHOULD be generated when the overall operation ends, successfully or otherwise. For " +
                "example, the completion of a cleaning operation in a Robot Vacuum Cleaner, or the completion of a " +
                "wash cycle in a Washing Machine." +
                "\n" +
                "It is highly recommended that appliances device types employing the Operational State cluster " +
                "support this event, even if it is optional. This assists clients in executing automations or issuing " +
                "notifications at critical points in the device operation cycles." +
                "\n" +
                "This event shall contain the following fields:",

            children: [
                {
                    tag: "field", name: "CompletionErrorCode", xref: "cluster§1.14.7.2.1",
                    details: "This field provides an indication of the state at the end of the operation. This field shall have a " +
                        "value from the ErrorStateEnum set. A value of NoError indicates success, that is, no error has been " +
                        "detected."
                },

                {
                    tag: "field", name: "TotalOperationalTime", xref: "cluster§1.14.7.2.2",
                    details: "The total operational time, in seconds, from when the operation was started via an initial Start " +
                        "command or autonomous/manual starting action, until the operation completed. This includes any time " +
                        "spent while paused. There may be cases whereby the total operational time exceeds the maximum value " +
                        "that can be conveyed by this attribute, in such instances, this attribute shall be populated with " +
                        "null."
                },

                {
                    tag: "field", name: "PausedTime", xref: "cluster§1.14.7.2.3",
                    details: "The total time spent in the paused state, in seconds. There may be cases whereby the total paused " +
                        "time exceeds the maximum value that can be conveyed by this attribute, in such instances, this " +
                        "attribute shall be populated with null."
                }
            ]
        },

        {
            tag: "command", name: "Pause", xref: "cluster§1.14.6.1",

            details: "This command shall be supported if the device supports remotely pausing the operation. If this " +
                "command is supported, the Resume command shall also be supported." +
                "\n" +
                "On receipt of this command, the device shall pause its operation if it is possible based on the " +
                "current function of the server. For example, if it is at a point where it is safe to do so and/or " +
                "permitted, but can be restarted from the point at which pause occurred." +
                "\n" +
                "If this command is received when already in the Paused state the device shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of NoError but take no further action." +
                "\n" +
                "A device that receives this command in any state which is not Pause-compatible shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState and shall take no " +
                "further action." +
                "\n" +
                "States are defined as Pause-compatible as follows:" +
                "\n" +
                "  • For states defined in this cluster specification, in Table 3, “Pause Compatibility”." +
                "\n" +
                "  • For states defined by derived cluster specifications, in the corresponding specifications." +
                "\n" +
                "  • For manufacturer-specific states, by the manufacturer." +
                "\n" +
                "A device that is unable to honor the Pause command for whatever reason shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState but take no further " +
                "action." +
                "\n" +
                "Otherwise, on success:" +
                "\n" +
                "  • The OperationalState attribute shall be set to Paused." +
                "\n" +
                "  • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "    NoError." +
                "\n" +
                "The following table defines the compatibility of this cluster’s states with the Pause command." +
                "\n" +
                "### Table 3. Pause Compatibility"
        },

        {
            tag: "command", name: "Stop", xref: "cluster§1.14.6.2",

            details: "This command shall be supported if the device supports remotely stopping the operation." +
                "\n" +
                "On receipt of this command, the device shall stop its operation if it is at a position where it is " +
                "safe to do so and/or permitted. Restart of the device following the receipt of the Stop command " +
                "shall require attended operation unless remote start is allowed by the device type and any " +
                "jurisdiction governing remote operation of the device." +
                "\n" +
                "If this command is received when already in the Stopped state the device shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of NoError but take no further action." +
                "\n" +
                "A device that is unable to honor the Stop command for whatever reason shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState but take no further " +
                "action." +
                "\n" +
                "Otherwise, on success:" +
                "\n" +
                "  • The OperationalState attribute shall be set to Stopped." +
                "\n" +
                "  • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "    NoError."
        },

        {
            tag: "command", name: "Start", xref: "cluster§1.14.6.3",

            details: "This command shall be supported if the device supports remotely starting the operation. If this " +
                "command is supported, the 'Stop command shall also be supported." +
                "\n" +
                "On receipt of this command, the device shall start its operation if it is safe to do so and the " +
                "device is in an operational state from which it can be started. There may be either regulatory or " +
                "manufacturer-imposed safety and security requirements that first necessitate some specific action at " +
                "the device before a Start command can be honored. In such instances, a device shall respond with a " +
                "status code of CommandInvalidInState if a Start command is received prior to the required on-device " +
                "action." +
                "\n" +
                "If this command is received when already in the Running state the device shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of NoError but take no further action." +
                "\n" +
                "A device that is unable to honor the Start command for whatever reason shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of UnableToStartOrResume but take no further " +
                "action." +
                "\n" +
                "Otherwise, on success:" +
                "\n" +
                "  • The OperationalState attribute shall be set to Running." +
                "\n" +
                "  • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "    NoError."
        },

        {
            tag: "command", name: "Resume", xref: "cluster§1.14.6.4",

            details: "This command shall be supported if the device supports remotely resuming the operation. If this " +
                "command is supported, the Pause command shall also be supported." +
                "\n" +
                "On receipt of this command, the device shall resume its operation from the point it was at when it " +
                "received the Pause command, or from the point when it was paused by means outside of this cluster " +
                "(for example by manual button press)." +
                "\n" +
                "If this command is received when already in the Running state the device shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of NoError but take no further action." +
                "\n" +
                "A device that receives this command in any state which is not Resume-compatible shall respond with " +
                "an OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState and shall take " +
                "no further action." +
                "\n" +
                "States are defined as Resume-compatible as follows:" +
                "\n" +
                "  • For states defined in this cluster specification, in Table 4, “Resume Compatibility”." +
                "\n" +
                "  • For states defined by derived cluster specifications, in the corresponding specifications." +
                "\n" +
                "  • For manufacturer-specific states, by the manufacturer." +
                "\n" +
                "The following table defines the compatibility of this cluster’s states with the Resume command." +
                "\n" +
                "### Table 4. Resume Compatibility" +
                "\n" +
                "A device that is unable to honor the Resume command for any other reason shall respond with an " +
                "OperationalCommandResponse command with an ErrorStateID of UnableToStartOrResume but take no further " +
                "action." +
                "\n" +
                "Otherwise, on success:" +
                "\n" +
                "  • The OperationalState attribute shall be set to the most recent non-Error operational state prior " +
                "    to entering the Paused state." +
                "\n" +
                "  • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of " +
                "    NoError."
        },

        {
            tag: "command", name: "OperationalCommandResponse", xref: "cluster§1.14.6.5",

            details: "This command shall be supported by an implementation if any of the other commands defined by this " +
                "cluster are supported (i.e. listed in the AcceptedCommandList global attribute). This command shall " +
                "also be supported by an implementation of a derived cluster as a response to any commands that may " +
                "be additionally defined therein." +
                "\n" +
                "This command shall be generated in response to any of the Start, Stop, Pause, or Resume commands.",

            children: [{
                tag: "field", name: "CommandResponseState", xref: "cluster§1.14.6.5.1",
                details: "This shall indicate the success or otherwise of the attempted command invocation. On a successful " +
                    "invocation of the attempted command, the ErrorStateID shall be populated with NoError. See the " +
                    "individual command sections for additional specific requirements on population."
            }]
        },

        {
            tag: "datatype", name: "OperationalStateEnum", xref: "cluster§1.14.4.1",

            details: "This type defines the set of known operational state values, and is derived from enum8. The " +
                "following table defines the applicable ranges for values that are defined within this type. All " +
                "values that are undefined shall be treated as reserved. As shown by the table, states that may be " +
                "specific to a certain Device Type or other modality shall be defined in a derived cluster of this " +
                "cluster." +
                "\n" +
                "The derived cluster-specific state definitions shall NOT duplicate any general state definitions. " +
                "That is, a derived cluster specification of this cluster cannot define states with the same " +
                "semantics as the general states defined below." +
                "\n" +
                "A manufacturer-specific state definition shall NOT duplicate the general state definitions or " +
                "derived cluster state definitions. That is, a manufacturer-defined state defined for this cluster or " +
                "a derived cluster thereof cannot define a state with the same semantics as the general states " +
                "defined below or states defined in a derived cluster. Such manufacturer-specific state definitions " +
                "shall be scoped in the context of the Vendor ID present in the Basic Information cluster." +
                "\n" +
                "The following table defines the generally applicable states.",

            children: [
                { tag: "field", name: "Stopped", description: "The device is stopped" },
                { tag: "field", name: "Running", description: "The device is operating" },
                { tag: "field", name: "Paused", description: "The device is paused during an operation" },
                { tag: "field", name: "Error", description: "The device is in an error state" }
            ]
        },

        {
            tag: "datatype", name: "OperationalStateStruct", xref: "cluster§1.14.4.2",
            details: "The OperationalStateStruct is used to indicate a possible state of the device.",

            children: [
                {
                    tag: "field", name: "OperationalStateId", xref: "cluster§1.14.4.2.1",
                    details: "This shall be populated with a value from the OperationalStateEnum."
                },
                {
                    tag: "field", name: "OperationalStateLabel", xref: "cluster§1.14.4.2.2",
                    details: "This field is present when the OperationalStateID is from the set reserved for Manufacturer Specific " +
                        "States. If present, this shall contain a human-readable description of the operational state."
                }
            ]
        },

        {
            tag: "datatype", name: "ErrorStateEnum", xref: "cluster§1.14.4.3",

            details: "This type defines the set of known operational error values, and is derived from enum8. The " +
                "following table defines the applicable ranges for values that are defined within this type. All " +
                "values that are undefined shall be treated as reserved. As shown by the table, errors that may be " +
                "specific to a certain Device Type or other modality shall be defined in a derived cluster of this " +
                "cluster." +
                "\n" +
                "The derived cluster-specific error definitions shall NOT duplicate the general error definitions. " +
                "That is, a derived cluster specification of this cluster cannot define errors with the same " +
                "semantics as the general errors defined below." +
                "\n" +
                "The manufacturer-specific error definitions shall NOT duplicate the general error definitions or " +
                "derived cluster-specific error definitions. That is, a manufacturer-defined error defined for this " +
                "cluster or a derived cluster thereof cannot define errors with the same semantics as the general " +
                "errors defined below or errors defined in a derived cluster. Such manufacturer-specific error " +
                "definitions shall be scoped in the context of the Vendor ID present in the Basic Information " +
                "cluster." +
                "\n" +
                "The set of ErrorStateID field values defined in each of the generic or derived Operational State " +
                "cluster specifications is called ErrorState.",

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
                }
            ]
        },

        {
            tag: "datatype", name: "ErrorStateStruct", xref: "cluster§1.14.4.4",

            children: [
                {
                    tag: "field", name: "ErrorStateId", xref: "cluster§1.14.4.4.1",
                    details: "This shall be populated with a value from the ErrorStateEnum."
                },
                {
                    tag: "field", name: "ErrorStateLabel", xref: "cluster§1.14.4.4.2",
                    details: "This field is present when the ErrorStateID is from the set reserved for Manufacturer Specific " +
                        "errors. If present, this shall contain a human-readable description of the error state."
                },

                {
                    tag: "field", name: "ErrorStateDetails", xref: "cluster§1.14.4.4.3",
                    details: "This shall be a human-readable string that provides details about the error condition. As an " +
                        "example, if the ErrorStateID indicates that the device is a Robotic Vacuum that is stuck, the " +
                        "ErrorStateDetails contains \"left wheel blocked\"."
                }
            ]
        }
    ]
});
