/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "IcdManagement", pics: "ICDM", xref: "core§9.16",
    details: "ICD Management Cluster enables configuration of the ICD’s behavior and ensuring that listed clients " +
        "can be notified when an intermittently connected device, ICD, is available for communication." +
        "\n" +
        "The cluster implements the requirements of the Check-In Protocol that enables the ICD Check-In use " +
        "case.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§9.16.4",

            children: [
                {
                    tag: "field", name: "CIP", xref: "core§9.16.4.1",
                    details: "When this feature is supported, the device shall support all the associated commands and attributes " +
                        "to properly support the Check-In Protocol."
                },
                {
                    tag: "field", name: "UAT", xref: "core§9.16.4.2",
                    details: "This feature is supported if and only if the device has a user active mode trigger."
                },
                {
                    tag: "field", name: "LITS", xref: "core§9.16.4.3",
                    details: "This feature is supported if and only the device is a Long Idle Time ICD."
                },

                {
                    tag: "field", name: "DSLS", xref: "core§9.16.4.4",
                    details: "This feature is supported if and only if the device can switch between SIT and LIT operating modes " +
                        "even if it has a valid registered client. See the dynamic SIT / LIT operating mode switching for " +
                        "more details."
                }
            ]
        },

        {
            tag: "attribute", name: "IdleModeDuration", xref: "core§9.16.6.1",
            details: "Indicates the maximum interval in seconds the server can stay in idle mode. The IdleModeDuration " +
                "shall NOT be smaller than the ActiveModeDuration."
        },

        {
            tag: "attribute", name: "ActiveModeDuration", xref: "core§9.16.6.2",
            details: "Indicates the minimum interval in milliseconds the server typically will stay in active mode after " +
                "initial transition out of idle mode. The ActiveModeDuration does not include the " +
                "ActiveModeThreshold."
        },

        {
            tag: "attribute", name: "ActiveModeThreshold", xref: "core§9.16.6.3",
            details: "Indicates the minimum amount of time in milliseconds the server typically will stay active after " +
                "network activity when in active mode."
        },

        {
            tag: "attribute", name: "RegisteredClients", xref: "core§9.16.6.4",
            details: "This attribute shall contain all clients registered to receive notification if their subscription is " +
                "lost. The maximum number of entries that can be in the list shall be ClientsSupportedPerFabric for " +
                "each fabric supported on the server, as indicated by the value of the SupportedFabrics attribute in " +
                "the Operational Credentials cluster."
        },

        {
            tag: "attribute", name: "IcdCounter", xref: "core§9.16.6.5",
            details: "This attribute returns the value of the ICD Counter."
        },
        {
            tag: "attribute", name: "ClientsSupportedPerFabric", xref: "core§9.16.6.6",
            details: "Indicates the maximum number of entries that the server is able to store for each fabric in the " +
                "RegisteredClients attribute."
        },

        {
            tag: "attribute", name: "UserActiveModeTriggerHint", xref: "core§9.16.6.7",

            details: "Indicates which user action(s) will trigger the ICD to switch to Active mode. If the attribute " +
                "indicates support for a trigger that is dependent on the UserActiveModeTriggerInstruction in the " +
                "UserActiveModeTriggerHint table, the UserActiveModeTriggerInstruction attribute shall be implemented " +
                "and shall provide the required information, unless specified otherwise in the requirement column of " +
                "the UserActiveModeTriggerHint table." +
                "\n" +
                "ActuateSensorLightsBlink, ResetButtonLightsBlink and SetupButtonLightsBlink (i.e. bits 7, 9 and 14) " +
                "have a dependency on the UserActiveModeTriggerInstruction attribute but do not require the attribute " +
                "to be present." +
                "\n" +
                "### An ICD can indicate multiple ways of being put into Active Mode by setting multiple bits in the " +
                "bitmap at the same time. However, a device shall NOT set more than one bit which has a dependency on " +
                "the UserActiveModeTriggerInstruction attribute."
        },

        {
            tag: "attribute", name: "UserActiveModeTriggerInstruction", xref: "core§9.16.6.8",

            details: "The meaning of the attribute is dependent upon the UserActiveModeTriggerHint attribute value, and " +
                "the conformance is in indicated in the \"dependency\" column in UserActiveModeTriggerHint table. The " +
                "UserActiveModeTriggerInstruction attribute may give additional information on how to transition the " +
                "device to Active Mode. If the attribute is present, the value shall be encoded as a valid UTF-8 " +
                "string with a maximum length of 128 bytes. If the UserActiveModeTriggerHint has the " +
                "ActuateSensorSeconds, ActuateSensorTimes, ResetButtonSeconds, ResetButtonTimes, SetupButtonSeconds " +
                "or SetupButtonTimes set, the string shall consist solely of an encoding of N as a decimal unsigned " +
                "integer using the ASCII digits 0-9, and without leading zeros." +
                "\n" +
                "For example, given UserActiveModeTriggerHint=\"1024\", ResetButtonSeconds is set which indicates " +
                "\"Press Reset Button for N seconds\". Therefore, a value of UserActiveModeTriggerInstruction=\"6\" would " +
                "indicate that N is 6 in that context." +
                "\n" +
                "When CustomInstruction is set by the UserActiveModeTriggerHint attribute, indicating presence of a " +
                "custom string, the ICD SHOULD perform localization (translation to user’s preferred language, as " +
                "indicated in the Device’s currently configured locale). The Custom Instruction option SHOULD NOT be " +
                "used by an ICD that does not have knowledge of the user’s language preference." +
                "\n" +
                "When the UserActiveModeTriggerHint key indicates a light to blink (ActuateSensorLightsBlink, " +
                "ResetButtonLightsBlink or SetupButtonLightsBlink), information on color of light may be made " +
                "available via the UserActiveModeTriggerInstruction attribute. When using such color indication in " +
                "the UserActiveModeTriggerInstruction attribute, the string shall consist of exactly 6 hexadecimal " +
                "digits using the ASCII characters 0-F and encoding the RGB color value as used in HTML encodings."
        },

        {
            tag: "attribute", name: "OperatingMode", xref: "core§9.16.6.9",
            details: "Indicates the operating mode of the ICD as specified in the OperatingModeEnum." +
                "\n" +
                "  • If the ICD is operating as a LIT ICD, OperatingMode shall be LIT." +
                "\n" +
                "  • If the ICD is operating as a SIT ICD, OperatingMode shall be SIT."
        },

        {
            tag: "attribute", name: "MaximumCheckInBackoff", xref: "core§9.16.6.10",
            details: "Indicates the maximum time in seconds between two Check-In messages when back-off is active. The " +
                "MaximumCheckInBackoff shall NOT be smaller than the IdleModeDuration." +
                "\n" +
                "If the MaximumCheckInBackoff is equal to the IdleModeDuration, it means the ICD does not back-off."
        },

        {
            tag: "command", name: "RegisterClient", xref: "core§9.16.7.1",
            details: "This command allows a client to register itself with the ICD to be notified when the device is " +
                "available for communication.",

            children: [
                {
                    tag: "field", name: "CheckInNodeId", xref: "core§9.16.7.1.1",
                    details: "This field shall provide the node ID to which a Check-In message will be sent if there are no active " +
                        "subscriptions matching MonitoredSubject."
                },
                {
                    tag: "field", name: "MonitoredSubject", xref: "core§9.16.7.1.2",
                    details: "This field shall provide the monitored subject ID."
                },
                {
                    tag: "field", name: "Key", xref: "core§9.16.7.1.3",
                    details: "This field shall contain the ICDToken, a 128-bit symmetric key shared by the ICD and the ICD Client, " +
                        "used to encrypt Check-In messages from this ICD to the MonitoredSubject."
                },

                {
                    tag: "field", name: "VerificationKey", xref: "core§9.16.7.1.4",

                    details: "This field shall provide the verification key. The verification key represents the key already " +
                        "stored on the server. The verification key provided in this field shall be used by the server to " +
                        "guarantee that a client with manage permissions can only modify entries that contain a Key equal to " +
                        "the verification key. The verification key shall be provided for clients with manage permissions. " +
                        "The verification key SHOULD NOT be provided by clients with administrator permissions for the server " +
                        "cluster. The verification key shall be ignored by the server if it is provided by a client with " +
                        "administrator permissions for the server cluster."
                },

                {
                    tag: "field", name: "ClientType", xref: "core§9.16.7.1.5",

                    details: "This field shall provide the client type of the client registering." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "On receipt of the RegisterClient command, the server shall perform the following procedure:" +
                        "\n" +
                        "  1. The server verifies that an entry for the fabric is available in the server’s list of " +
                        "     registered clients." +
                        "\n" +
                        "    a. If one of the entries in storage for the fabric has the same CheckInNodeID as the received " +
                        "       CheckInNodeID, the server shall continue from step 2." +
                        "\n" +
                        "    b. If there is an available entry for the fabric, an entry is created for the fabric and the " +
                        "       received CheckInNodeID, MonitoredSubject, Key and ClientType are stored. The server shall " +
                        "       continue from step 5." +
                        "\n" +
                        "    c. If there are no available entries for the fabric, the status shall be RESOURCE_EXHAUSTED and " +
                        "       the server shall continue from step 6." +
                        "\n" +
                        "  2. The server shall verify the privileges of the command’s ISD." +
                        "\n" +
                        "    a. If the ISD of the command has administrator privileges for the server cluster, the server " +
                        "       shall continue from step 4." +
                        "\n" +
                        "    b. If the ISD of the command does not have administrator privileges for the server cluster, the " +
                        "       server shall continue from step 3." +
                        "\n" +
                        "  3. The server shall verify that the received verification key is equal to the key previously " +
                        "     stored in the list of registered clients with the matching CheckInNodeID." +
                        "\n" +
                        "    a. If the verification key does not have a valid value, the status shall be FAILURE. the server " +
                        "       shall continue from step 6." +
                        "\n" +
                        "    b. If the verification key is not equal to the Key value stored in the entry, the status shall " +
                        "       be FAILURE. The server shall continue from step 6." +
                        "\n" +
                        "    c. If the verification key is equal to the Key value stored in the entry, the server shall " +
                        "       continue from step 4." +
                        "\n" +
                        "  4. The entry shall be updated with the received CheckInNodeID, MonitoredSubject, Key and " +
                        "     ClientType." +
                        "\n" +
                        "    a. If the update fails, the status shall be FAILURE. The server shall continue from step 6." +
                        "\n" +
                        "    b. If the update succeeds, the server shall continue from step 5." +
                        "\n" +
                        "  5. The server shall persist the client information." +
                        "\n" +
                        "    a. If the persistence fails, the status shall be FAILURE and the server shall continue from step " +
                        "       6." +
                        "\n" +
                        "    b. If the persistence succeeds, the status shall be SUCCESS and the server shall continue from " +
                        "       step 6." +
                        "\n" +
                        "  6. The server shall generate a response." +
                        "\n" +
                        "    a. If the status is SUCCESS, the server shall generate a RegisterClientResponse command." +
                        "\n" +
                        "    b. If the status is not SUCCESS, the server shall generate a default response with the Status " +
                        "       field set to the evaluated error status."
                }
            ]
        },

        {
            tag: "command", name: "RegisterClientResponse", xref: "core§9.16.7.2",

            details: "This command shall be sent by the ICD Management Cluster server in response to a successful " +
                "RegisterClient command." +
                "\n" +
                "### When Generated" +
                "\n" +
                "This command shall be generated in response to a successful RegisterClient command. The ICDCounter " +
                "field shall be set to the ICDCounter attribute of the server."
        },

        {
            tag: "command", name: "UnregisterClient", xref: "core§9.16.7.3",
            details: "This command allows a client to unregister itself with the ICD. Example: a client that is leaving " +
                "the network (e.g. running on a phone which is leaving the home) can (and should) remove its " +
                "subscriptions and send this UnregisterClient command before leaving to prevent the burden on the ICD " +
                "of an absent client.",

            children: [
                {
                    tag: "field", name: "CheckInNodeId", xref: "core§9.16.7.3.1",
                    details: "This field shall provide the registered client node ID to remove from storage."
                },

                {
                    tag: "field", name: "VerificationKey", xref: "core§9.16.7.3.2",

                    details: "This field shall provide the verification key associated with the CheckInNodeID to remove from " +
                        "storage. The verification key represents the key already stored on the server. The verification key " +
                        "provided in this field shall be used by the server to guarantee that a client with manage " +
                        "permissions can only remove entries that contain a Key equal to the stored key. The verification key " +
                        "shall be provided for clients with manage permissions. The verification key SHOULD NOT be provided " +
                        "by clients with administrator permissions for the server cluster. The verification key shall be " +
                        "ignored by the server if it is provided by a client with administrator permissions for the server " +
                        "cluster." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "On receipt of the UnregisterClient command, the server shall perform the following procedure:" +
                        "\n" +
                        "  1. The server shall check whether there is a entry stored on the device for the fabric with the " +
                        "     same CheckInNodeID." +
                        "\n" +
                        "    a. If there are no entries stored for the fabric, the status shall be NOT_FOUND. The server " +
                        "       shall continue from step 6." +
                        "\n" +
                        "    b. If there is an error when reading from storage, the status shall be FAILURE. The server shall " +
                        "       continue from step 6." +
                        "\n" +
                        "    c. If there is at least one entry stored on the server for the fabric, the server shall continue " +
                        "       from step 2." +
                        "\n" +
                        "  2. The server shall verify if one of the entries for the fabric has the corresponding " +
                        "     CheckInNodeID received in the command." +
                        "\n" +
                        "    a. If no entries have the corresponding CheckInNodeID, the status shall be NOT_FOUND. The server " +
                        "       shall continue from step 6." +
                        "\n" +
                        "    b. If an entry has the corresponding CheckInNodeID, the server shall continue to step 3." +
                        "\n" +
                        "  3. The server shall check whether the ISD of the command has administrator permissions for the " +
                        "     server cluster." +
                        "\n" +
                        "    a. If the ISD of the command has administrator privileges for the server cluster, the server " +
                        "       shall continue from step 5." +
                        "\n" +
                        "    b. If the ISD of the command does not have administrator privileges for the server cluster, the " +
                        "       server shall continue from step 4." +
                        "\n" +
                        "  4. The server shall verify that the received verification key is equal to the key previously " +
                        "     stored in the list of registered clients with the matching CheckInNodeID." +
                        "\n" +
                        "    a. If the verification key does not have a valid value, the status shall be FAILURE. the server " +
                        "       shall continue from step 6." +
                        "\n" +
                        "    b. If the verification key is not equal to the Key value stored in the entry, the status shall " +
                        "       be FAILURE. The server shall continue from step 6." +
                        "\n" +
                        "    c. If the verification key is equal to the Key value stored in the entry, the server shall " +
                        "       continue from step 5." +
                        "\n" +
                        "  5. The server shall delete the entry with the matching CheckInNodeID from storage and will persist " +
                        "     the change." +
                        "\n" +
                        "    a. If the removal of the entry fails, the status shall be FAILURE. The server shall continue " +
                        "       from step 6." +
                        "\n" +
                        "    b. If the removal succeeds, the status shall be SUCCESS and the server shall continue to step 6." +
                        "\n" +
                        "  6. The server shall generate a response with the Status field set to the evaluated status."
                }
            ]
        },

        {
            tag: "command", name: "StayActiveRequest", xref: "core§9.16.7.4",

            details: "This command allows a client to request that the server stays in active mode for at least a given " +
                "time duration (in milliseconds) from when this command is received." +
                "\n" +
                "This StayActiveDuration may be longer than the ActiveModeThreshold value and would, typically, be " +
                "used by the client to request the server to stay active and responsive for this period to allow a " +
                "sequence of message exchanges during that period. The client may slightly overestimate the duration " +
                "it wants the ICD to be active for, in order to account for network delays." +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "When receiving a StayActiveRequest command, the server shall calculate the maximum " +
                "PromisedActiveDuration it can remain active as the greater of the following two values:" +
                "\n" +
                "  • StayActiveDuration: Specified in the received command by the client." +
                "\n" +
                "  • Remaining Active Time: The server’s planned remaining active time based on the " +
                "    ActiveModeThreshold and its internal resources and power budget." +
                "\n" +
                "A server may replace StayActiveDuration with Minimum Active Duration in the above calculation." +
                "\n" +
                "PromisedActiveDuration represents the guaranteed minimum time the server will remain active, taking " +
                "into account both the requested duration and the server’s capabilities." +
                "\n" +
                "The ICD shall report the calculated PromisedActiveDuration in a StayActiveResponse message back to " +
                "the client."
        },

        {
            tag: "command", name: "StayActiveResponse", xref: "core§9.16.7.5",
            details: "This message shall be sent by the ICD in response to the StayActiveRequest command and shall contain " +
                "the computed duration (in milliseconds) that the ICD intends to stay active for.",

            children: [{
                tag: "field", name: "PromisedActiveDuration", xref: "core§9.16.7.5.1",

                details: "This field shall provide the actual duration that the ICD server can stay active from the time it " +
                    "receives the StayActiveRequest command." +
                    "\n" +
                    "### Minimum Value for PromisedActiveDuration" +
                    "\n" +
                    "The minimum value of the PromisedActiveDuration field shall be equal to either 30000 milliseconds or " +
                    "StayActiveDuration (from the received StayActiveRequest command), whichever is smaller."
            }]
        },

        {
            tag: "datatype", name: "UserActiveModeTriggerBitmap", xref: "core§9.16.5.1",
            details: "See the UserActiveModeTriggerHint table for requirements associated to each bit.",

            children: [
                { tag: "field", name: "PowerCycle", description: "Power Cycle to transition the device to ActiveMode" },
                {
                    tag: "field", name: "SettingsMenu",
                    description: "Settings menu on the device informs how to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "CustomInstruction",
                    description: "Custom Instruction on how to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "DeviceManual",
                    description: "Device Manual informs how to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ActuateSensor",
                    description: "Actuate Sensor to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ActuateSensorSeconds",
                    description: "Actuate Sensor for N seconds to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ActuateSensorTimes",
                    description: "Actuate Sensor N times to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ActuateSensorLightsBlink",
                    description: "Actuate Sensor until light blinks to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ResetButton",
                    description: "Press Reset Button to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ResetButtonLightsBlink",
                    description: "Press Reset Button until light blinks to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ResetButtonSeconds",
                    description: "Press Reset Button for N seconds to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "ResetButtonTimes",
                    description: "Press Reset Button N times to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "SetupButton",
                    description: "Press Setup Button to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "SetupButtonSeconds",
                    description: "Press Setup Button for N seconds to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "SetupButtonLightsBlink",
                    description: "Press Setup Button until light blinks to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "SetupButtonTimes",
                    description: "Press Setup Button N times to transition the device to ActiveMode"
                },
                {
                    tag: "field", name: "AppDefinedButton",
                    description: "Press the N Button to transition the device to ActiveMode"
                }
            ]
        },

        {
            tag: "datatype", name: "ClientTypeEnum", xref: "core§9.16.5.1.1",

            children: [
                {
                    tag: "field", name: "Permanent",
                    description: "The client is typically resident, always-on, fixed infrastructure in the home."
                },
                {
                    tag: "field", name: "Ephemeral",
                    description: "The client is mobile or non-resident or not always-on and may not always be available in the home."
                }
            ]
        },

        {
            tag: "datatype", name: "OperatingModeEnum", xref: "core§9.16.5.2",
            children: [
                { tag: "field", name: "Sit", description: "ICD is operating as a Short Idle Time ICD." },
                { tag: "field", name: "Lit", description: "ICD is operating as a Long Idle Time ICD." }
            ]
        },

        {
            tag: "datatype", name: "MonitoringRegistrationStruct", xref: "core§9.16.5.3",

            children: [
                {
                    tag: "field", name: "CheckInNodeId", xref: "core§9.16.5.3.1",
                    details: "This field shall indicate the NodeID of the Node to which Check-In messages will be sent when the " +
                        "MonitoredSubject is not subscribed."
                },

                {
                    tag: "field", name: "MonitoredSubject", xref: "core§9.16.5.3.2",

                    details: "This field shall indicate the monitored Subject ID. This field shall be used to determine if a " +
                        "particular client has an active subscription for the given entry. The MonitoredSubject, when it is a " +
                        "NodeID, may be the same as the CheckInNodeID. The MonitoredSubject gives the registering client the " +
                        "flexibility of having a different CheckInNodeID from the MonitoredSubject. A subscription shall " +
                        "count as an active subscription for this entry if:" +
                        "\n" +
                        "  • It is on the associated fabric of this entry, and" +
                        "\n" +
                        "  • The subject of this entry matches the ISD of the SubscriptionRequest message that created the " +
                        "    subscription. Matching shall be determined using the subject_matches function defined in the " +
                        "    Access Control Privilege Granting Algorithm." +
                        "\n" +
                        "For example, if the MonitoredSubject is Node ID 0x1111_2222_3333_AAAA, and one of the subscribers to " +
                        "the server on the entry’s associated fabric bears that Node ID, then the entry matches." +
                        "\n" +
                        "Another example is if the MonitoredSubject has the value 0xFFFF_FFFD_AA12_0002, and one of the " +
                        "subscribers to the server on the entry’s associated fabric bears the CASE Authenticated TAG value " +
                        "0xAA12 and the version 0x0002 or higher within its NOC, then the entry matches."
                },

                {
                    tag: "field", name: "Key", xref: "core§9.16.5.3.3",
                    details: "This field is deprecated. Use the RegisterClient command to set the ICDToken."
                },
                {
                    tag: "field", name: "ClientType", xref: "core§9.16.5.3.4",
                    details: "This field shall indicate the client’s type to inform the ICD of the availability for communication " +
                        "of the client."
                }
            ]
        }
    ]
});
