/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ValveConfigurationAndControl", pics: "VALCC", xref: "cluster§4.6",
    details: "This cluster is used to configure a valve.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§4.6.4",

            children: [
                {
                    tag: "field", name: "TS", xref: "cluster§4.6.4.1",
                    details: "This feature shall indicate that the valve uses Time Synchronization and UTC time to indicate " +
                        "duration and auto close time." +
                        "\n" +
                        "This feature shall NOT be supported unless the device supports the Time Synchronization cluster."
                },

                {
                    tag: "field", name: "LVL", xref: "cluster§4.6.4.2",
                    details: "This feature shall indicate that the valve is capable of being adjusted to a specific position, as a " +
                        "percentage, of its full range of motion."
                }
            ]
        },

        {
            tag: "attribute", name: "OpenDuration", xref: "cluster§4.6.7.1",
            details: "Indicates the total duration, in seconds, for which the valve will remain open for this current " +
                "opening." +
                "\n" +
                "A value of null shall indicate the duration is not set, meaning that the valve will remain open " +
                "until closed by the user or some other automation."
        },

        {
            tag: "attribute", name: "DefaultOpenDuration", xref: "cluster§4.6.7.2",
            details: "Indicates the default duration, in seconds, for which the valve will remain open, if the " +
                "OpenDuration field is not present in the Open command." +
                "\n" +
                "A value of null shall indicate the duration is not set, meaning that the valve will remain open " +
                "until closed by the user or some other automation."
        },

        {
            tag: "attribute", name: "AutoCloseTime", xref: "cluster§4.6.7.3",

            details: "Indicates the UTC time when the valve will close, depending on value of the OpenDuration attribute." +
                "\n" +
                "Null:" +
                "\n" +
                "  • When OpenDuration is null, or" +
                "\n" +
                "  • When the valve does not have a synchronized UTCTime in the Time Synchronization cluster, or" +
                "\n" +
                "  • When the valve is closed." +
                "\n" +
                "When the value of this attribute is earlier or equal to the current UTC time, the valve shall " +
                "automatically transition to its closed position. The behavior of transitioning to the closed " +
                "position, shall match the behavior described in the Close command." +
                "\n" +
                "If this attribute is not null and the Time Synchronization cluster receives a SetUTCTime command, " +
                "modifying the current UTC time of the device, the value of this attribute shall be adjusted to match " +
                "the new UTC time plus the value of the RemainingDuration attribute."
        },

        {
            tag: "attribute", name: "RemainingDuration", xref: "cluster§4.6.7.4",

            details: "Indicates the remaining duration, in seconds, until the valve closes. Null:" +
                "\n" +
                "  • When OpenDuration is null, or" +
                "\n" +
                "  • When the valve is closed." +
                "\n" +
                "The value of this attribute shall only be reported in the following cases:" +
                "\n" +
                "  • When it changes from null to any other value and vice versa, or" +
                "\n" +
                "  • When it changes to 0, or" +
                "\n" +
                "  • When it increases, or" +
                "\n" +
                "  • When the closing time changes." +
                "\n" +
                "Meaning that clients SHOULD NOT rely on the reporting of this attribute in order to keep track of " +
                "the remaining duration, due to this attribute not being reported during regular countdown." +
                "\n" +
                "When reading this attribute it shall return the remaining duration, in seconds, until the valve " +
                "closes." +
                "\n" +
                "When the value of this attribute counts down to 0, the valve shall automatically transition to its " +
                "closed position. The behavior of transitioning to the closed position shall match the behavior " +
                "described in the Close command."
        },

        {
            tag: "attribute", name: "CurrentState", xref: "cluster§4.6.7.5",
            details: "Indicates the current state of the valve." +
                "\n" +
                "A value of null shall indicate that the current state is not known."
        },

        {
            tag: "attribute", name: "TargetState", xref: "cluster§4.6.7.6",
            details: "Indicates the target state, while changing the state, of the valve." +
                "\n" +
                "A value of null shall indicate that no target position is set, since the change in state is either " +
                "done or failed."
        },

        {
            tag: "attribute", name: "CurrentLevel", xref: "cluster§4.6.7.7",

            details: "Indicates the current level of the valve as a percentage value, between fully closed and fully open. " +
                "During a transition from one level to another level, the valve SHOULD keep this attribute updated to " +
                "the best of its ability, in order to represent the actual level of the valve during the movement." +
                "\n" +
                "A value of 100 percent shall indicate the fully open position. A value of 0 percent shall indicate " +
                "the fully closed position." +
                "\n" +
                "A value of null shall indicate that the current state is not known."
        },

        {
            tag: "attribute", name: "TargetLevel", xref: "cluster§4.6.7.8",

            details: "Indicates the target level of the valve as a percentage value, between fully closed and fully open." +
                "\n" +
                "The interpretation of the percentage value is the same as for the CurrentLevel attribute." +
                "\n" +
                "A value of null shall indicate that no target position is set, since the change of level is either " +
                "done or failed."
        },

        {
            tag: "attribute", name: "DefaultOpenLevel", xref: "cluster§4.6.7.9",

            details: "Indicates the default value used for the TargetLevel attribute, when a valve transitions from the " +
                "closed to the open state, caused by an Open command, if a TargetLevel field is not present in the " +
                "Open command." +
                "\n" +
                "If the LevelStep attribute is present and the value of a write interaction to this attribute field " +
                "is not 100, the value shall be a supported value as defined by the LevelStep attribute, such that " +
                "(Value received in the write interaction) % (Value of LevelStep attribute) equals 0. If the " +
                "resulting value is not 0, the requested DefaultOpenLevel value is considered an unsupported value " +
                "and a CONSTRAINT_ERROR status shall be returned."
        },

        {
            tag: "attribute", name: "ValveFault", xref: "cluster§4.6.7.10",
            details: "Indicates any faults registered by the valve."
        },

        {
            tag: "attribute", name: "LevelStep", xref: "cluster§4.6.7.11",

            details: "Indicates the step size the valve can support." +
                "\n" +
                "The step size defined by this attribute is counted from 0 and the final step towards 100 may be " +
                "different than what is defined in this attribute. For example, if the value of this attribute is 15, " +
                "it results in these target values being supported; 0, 15, 30, 45, 60, 75, 90 and 100." +
                "\n" +
                "The values of 0 and 100 shall always be supported, regardless of the value of this attribute."
        },

        {
            tag: "event", name: "ValveStateChanged", xref: "cluster§4.6.9.1",
            details: "This event shall be generated when the valve state changed. For level changes, after the end of " +
                "movement, for state changes when the new state has been reached.",

            children: [
                {
                    tag: "field", name: "ValveState", xref: "cluster§4.6.9.1.1",
                    details: "This field shall indicate the new state of the valve."
                },
                {
                    tag: "field", name: "ValveLevel", xref: "cluster§4.6.9.1.2",
                    details: "This field shall indicate the new level of the valve."
                }
            ]
        },

        {
            tag: "event", name: "ValveFault", xref: "cluster§4.6.9.2",
            details: "This event shall be generated when the valve registers or clears a fault, e.g. not being able to " +
                "transition to the requested target level or state.",
            children: [{
                tag: "field", name: "ValveFault", xref: "cluster§4.6.9.2.1",
                details: "This field shall indicate the value of the ValveFault attribute, at the time this event is " +
                    "generated."
            }]
        },

        {
            tag: "command", name: "Open", xref: "cluster§4.6.8.1",
            details: "This command is used to set the valve to its open position.",

            children: [
                {
                    tag: "field", name: "OpenDuration", xref: "cluster§4.6.8.1.1",
                    details: "This field shall indicate the duration that the valve will remain open for this specific Open " +
                        "command." +
                        "\n" +
                        "A value of null shall indicate the duration is not set, meaning that the valve will remain open " +
                        "until closed by the user or some other automation."
                },

                {
                    tag: "field", name: "TargetLevel", xref: "cluster§4.6.8.1.2",
                    details: "This field shall indicate the target level used for this specific Open command."
                }
            ]
        },

        {
            tag: "command", name: "Close", xref: "cluster§4.6.8.2",
            details: "This command is used to set the valve to its closed position."
        },

        {
            tag: "datatype", name: "ValveFaultBitmap", xref: "cluster§4.6.5.1",

            children: [
                { tag: "field", name: "GeneralFault", description: "Unspecified fault detected" },
                { tag: "field", name: "Blocked", description: "Valve is blocked" },
                { tag: "field", name: "Leaking", description: "Valve has detected a leak" },
                { tag: "field", name: "NotConnected", description: "No valve is connected to controller" },
                { tag: "field", name: "ShortCircuit", description: "Short circuit is detected" },
                { tag: "field", name: "CurrentExceeded", description: "The available current has been exceeded" }
            ]
        },

        {
            tag: "datatype", name: "ValveStateEnum", xref: "cluster§4.6.5.2",

            children: [
                { tag: "field", name: "Closed", description: "Valve is in closed position" },
                { tag: "field", name: "Open", description: "Valve is in open position" },
                {
                    tag: "field", name: "Transitioning",
                    description: "Valve is transitioning between closed and open positions or between levels"
                }
            ]
        },

        {
            tag: "datatype", name: "StatusCodeEnum", xref: "cluster§4.6.6.1",
            children: [{
                tag: "field", name: "FailureDueToFault",
                description: "The requested action could not be performed due to a fault on the valve."
            }]
        }
    ]
});
