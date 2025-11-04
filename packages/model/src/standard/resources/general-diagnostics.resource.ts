/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "GeneralDiagnostics", pics: "DGGEN", xref: "core§11.12",
    details: "The General Diagnostics Cluster, along with other diagnostics clusters, provide a means to acquire " +
        "standardized diagnostics metrics that may be used by a Node to assist a user or Administrator in " +
        "diagnosing potential problems. The General Diagnostics Cluster attempts to centralize all metrics " +
        "that are broadly relevant to the majority of Nodes.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.12.4",

            children: [{
                tag: "field", name: "DMTEST", xref: "core§11.12.4.1",
                details: "This feature indicates support for extended Data Model testing commands, which are required in some " +
                    "situations." +
                    "\n" +
                    "This feature shall be supported if the MaxPathsPerInvoke attribute of the Basic Information Cluster " +
                    "has a value > 1."
            }]
        },

        {
            tag: "attribute", name: "NetworkInterfaces", xref: "core§11.12.6.1",
            details: "The NetworkInterfaces attribute shall be a list of NetworkInterface structs. Each logical network " +
                "interface on the Node shall be represented by a single entry within the NetworkInterfaces attribute."
        },

        {
            tag: "attribute", name: "RebootCount", xref: "core§11.12.6.2",
            details: "The RebootCount attribute shall indicate a best-effort count of the number of times the Node has " +
                "rebooted. The RebootCount attribute SHOULD be incremented each time the Node reboots. The " +
                "RebootCount attribute shall NOT be incremented when a Node wakes from a low-power or sleep state. " +
                "The RebootCount attribute shall only be reset to 0 upon a factory reset of the Node."
        },

        {
            tag: "attribute", name: "UpTime", xref: "core§11.12.6.3",
            details: "The UpTime attribute shall indicate a best-effort assessment of the length of time, in seconds, " +
                "since the Node’s last reboot. This attribute SHOULD be incremented to account for the periods of " +
                "time that a Node is in a low-power or sleep state. This attribute shall only be reset upon a device " +
                "reboot. This attribute shall be based on the same System Time source as those used to fulfill any " +
                "usage of the systime-us and systime-ms data types within the server."
        },

        {
            tag: "attribute", name: "TotalOperationalHours", xref: "core§11.12.6.4",
            details: "The TotalOperationalHours attribute shall indicate a best-effort attempt at tracking the length of " +
                "time, in hours, that the Node has been operational. The TotalOperationalHours attribute SHOULD be " +
                "incremented to account for the periods of time that a Node is in a low-power or sleep state. The " +
                "TotalOperationalHours attribute shall only be reset upon a factory reset of the Node."
        },

        {
            tag: "attribute", name: "BootReason", xref: "core§11.12.6.5",
            details: "The BootReason attribute shall indicate the reason for the Node’s most recent boot."
        },

        {
            tag: "attribute", name: "ActiveHardwareFaults", xref: "core§11.12.6.6",

            details: "The ActiveHardwareFaults attribute shall indicate the set of faults currently detected by the Node. " +
                "When the Node detects a fault has been raised, the appropriate HardwareFaultEnum value shall be " +
                "added to this list. This list shall NOT contain more than one instance of a specific " +
                "HardwareFaultEnum value. When the Node detects that all conditions contributing to a fault has been " +
                "cleared, the corresponding HardwareFaultEnum value shall be removed from this list. An empty list " +
                "shall indicate there are currently no active faults. The order of this list SHOULD have no " +
                "significance. Clients interested in monitoring changes in active faults may subscribe to this " +
                "attribute, or they may subscribe to HardwareFaultChange."
        },

        {
            tag: "attribute", name: "ActiveRadioFaults", xref: "core§11.12.6.7",

            details: "The ActiveRadioFaults attribute shall indicate the set of faults currently detected by the Node. " +
                "When the Node detects a fault has been raised, the appropriate RadioFaultEnum value shall be added " +
                "to this list. This list shall NOT contain more than one instance of a specific RadioFaultEnum value. " +
                "When the Node detects that all conditions contributing to a fault has been cleared, the " +
                "corresponding RadioFaultEnum value shall be removed from this list. An empty list shall indicate " +
                "there are currently no active faults. The order of this list SHOULD have no significance. Clients " +
                "interested in monitoring changes in active faults may subscribe to this attribute, or they may " +
                "subscribe to RadioFaultChange."
        },

        {
            tag: "attribute", name: "ActiveNetworkFaults", xref: "core§11.12.6.8",

            details: "The ActiveNetworkFaults attribute shall indicate the set of faults currently detected by the Node. " +
                "When the Node detects a fault has been raised, the appropriate NetworkFaultEnum value shall be added " +
                "to this list. This list shall NOT contain more than one instance of a specific NetworkFaultEnum " +
                "value. When the Node detects that all conditions contributing to a fault has been cleared, the " +
                "corresponding NetworkFaultEnum value shall be removed from this list. An empty list shall indicate " +
                "there are currently no active faults. The order of this list SHOULD have no significance. Clients " +
                "interested in monitoring changes in active faults may subscribe to this attribute, or they may " +
                "subscribe to NetworkFaultChange."
        },

        {
            tag: "attribute", name: "TestEventTriggersEnabled", xref: "core§11.12.6.9",

            details: "The TestEventTriggersEnabled attribute shall indicate whether the Node has any TestEventTrigger " +
                "configured. When this attribute is true, the Node has been configured with one or more test event " +
                "triggers by virtue of the internally programmed EnableKey value (see Section 11.12.7.1, " +
                "“TestEventTrigger Command”) being set to a non-zero value. This attribute can be used by " +
                "Administrators to detect if a device was inadvertently commissioned with test event trigger mode " +
                "enabled, and take appropriate action (e.g. warn the user and/or offer to remove all fabrics on the " +
                "Node)."
        },

        { tag: "attribute", name: "DoNotUse", xref: "core§11.12.6" },

        {
            tag: "event", name: "HardwareFaultChange", xref: "core§11.12.8.1",
            details: "The HardwareFaultChange Event shall indicate a change in the set of hardware faults currently " +
                "detected by the Node.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.12.8.1.1",
                    details: "This field shall represent the set of faults currently detected, as per HardwareFaultEnum."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.12.8.1.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "HardwareFaultEnum."
                }
            ]
        },

        {
            tag: "event", name: "RadioFaultChange", xref: "core§11.12.8.2",
            details: "The RadioFaultChange Event shall indicate a change in the set of radio faults currently detected by " +
                "the Node.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.12.8.2.1",
                    details: "This field shall represent the set of faults currently detected, as per RadioFaultEnum."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.12.8.2.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "RadioFaultEnum."
                }
            ]
        },

        {
            tag: "event", name: "NetworkFaultChange", xref: "core§11.12.8.3",
            details: "The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected " +
                "by the Node.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.12.8.3.1",
                    details: "This field shall represent the set of faults currently detected, as per NetworkFaultEnum."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.12.8.3.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "NetworkFaultEnum."
                }
            ]
        },

        {
            tag: "event", name: "BootReason", xref: "core§11.12.8.4",
            details: "The BootReason Event shall indicate the reason that caused the device to start-up.",
            children: [{
                tag: "field", name: "BootReason", xref: "core§11.12.8.4.1",
                details: "This field shall contain the reason for this BootReason event."
            }]
        },

        {
            tag: "command", name: "TestEventTrigger", xref: "core§11.12.7.1",

            details: "This command shall be supported to provide a means for certification tests to trigger some " +
                "test-plan-specific events, necessary to assist in automation of device interactions for some " +
                "certification test cases. This command shall NOT cause any changes to the state of the device that " +
                "persist after the last fabric is removed." +
                "\n" +
                "The fields for the TestEventTrigger command are as follows:",

            children: [
                {
                    tag: "field", name: "EnableKey", xref: "core§11.12.7.1.1",

                    details: "The EnableKey is a 128 bit value provided by the client in this command, which needs to match a " +
                        "value chosen by the manufacturer and configured on the server using manufacturer-specific means, " +
                        "such as pre-provisioning. The value of all zeroes is reserved to indicate that no EnableKey is set. " +
                        "Therefore, if the EnableKey field is received with all zeroes, this command shall FAIL with a " +
                        "response status of CONSTRAINT_ERROR." +
                        "\n" +
                        "The EnableKey SHOULD be unique per exact set of devices going to a certification test." +
                        "\n" +
                        "Devices not targeted towards going to a certification test event shall NOT have a non-zero EnableKey " +
                        "value configured, so that only devices in test environments are responsive to this command." +
                        "\n" +
                        "In order to prevent unwittingly actuating a particular trigger, this command shall respond with a " +
                        "response status of CONSTRAINT_ERROR if the EnableKey field does not match the a-priori value " +
                        "configured on the device."
                },

                {
                    tag: "field", name: "EventTrigger", xref: "core§11.12.7.1.2",

                    details: "This field shall indicate the test or test mode which the client wants to trigger." +
                        "\n" +
                        "The expected side-effects of EventTrigger values are out of scope of this specification and will be " +
                        "described within appropriate certification test literature provided to manufacturers by the " +
                        "Connectivity Standards Alliance, in conjunction with certification test cases documentation." +
                        "\n" +
                        "Values of EventTrigger in the range 0xFFFF_FFFF_0000_0000 through 0xFFFF_FFFF_FFFF_FFFF are reserved " +
                        "for testing use by manufacturers and will not appear in the Connectivity Standards Alliance " +
                        "certification test literature." +
                        "\n" +
                        "If the value of EventTrigger received is not supported by the receiving Node, this command shall " +
                        "fail with a status code of INVALID_COMMAND." +
                        "\n" +
                        "Otherwise, if the EnableKey value matches the configured internal value for a particular Node, and " +
                        "the EventTrigger value matches a supported test event trigger value, the command shall succeed and " +
                        "execute the expected trigger action." +
                        "\n" +
                        "If no specific test event triggers are required to be supported by certification test requirements " +
                        "for the features that a given product will be certified against, this command may always fail with " +
                        "the INVALID_COMMAND status, equivalent to the situation of receiving an unknown EventTrigger, for " +
                        "all possible EventTrigger values."
                }
            ]
        },

        {
            tag: "command", name: "TimeSnapshot", xref: "core§11.12.7.2",

            details: "This command may be used by a client to obtain a correlated view of both System Time, and, if " +
                "currently synchronized and supported, \"wall clock time\" of the server. This can help clients " +
                "establish time correlation between their concept of time and the server’s concept of time. This is " +
                "especially useful when processing event histories where some events only contain System Time." +
                "\n" +
                "Upon command invocation, the server shall respond with a TimeSnapshotResponse."
        },

        {
            tag: "command", name: "TimeSnapshotResponse", xref: "core§11.12.7.3",

            details: "This command shall be generated in response to a TimeSnapshot command." +
                "\n" +
                "When generating this response, all fields shall be gathered as close together in time as possible, " +
                "so that the time jitter between the values is minimized." +
                "\n" +
                "If the Time Synchronization cluster is supported by the node, the PosixTimeMs field shall NOT be " +
                "null unless the UTCTime attribute in the Time Synchronization cluster is also null.",

            children: [
                {
                    tag: "field", name: "SystemTimeMs", xref: "core§11.12.7.3.1",
                    details: "This shall indicate the current System Time in milliseconds (type systime-ms), with the value taken " +
                        "at the time of processing of the TimeSnapshot command that generated this response." +
                        "\n" +
                        "The value shall be taken from the same clock which populates the Timestamp field in events when " +
                        "using System Time for the field."
                },

                {
                    tag: "field", name: "PosixTimeMs", xref: "core§11.12.7.3.2",

                    details: "This shall indicate the current time in POSIX Time in milliseconds, with the value taken from the " +
                        "same source that could populate the Timestamp field of events. This value shall only be null when " +
                        "any the following are true:" +
                        "\n" +
                        "  • The node doesn’t support the Time Synchronization cluster." +
                        "\n" +
                        "  • The node’s Time Synchronization cluster instance’s UTCTime attribute is null."
                }
            ]
        },

        {
            tag: "command", name: "PayloadTestRequest", xref: "core§11.12.7.4",

            details: "This command provides a means for certification tests or manufacturer’s internal tests to validate " +
                "particular command handling and encoding constraints by generating a response of a given size." +
                "\n" +
                "This command shall use the same EnableKey behavior as the TestEventTrigger command, whereby " +
                "processing of the command is only enabled when the TestEventTriggersEnabled field is true, which " +
                "shall NOT be true outside of certification testing or manufacturer’s internal tests." +
                "\n" +
                "The fields for the PayloadTestRequest command are as follows:",

            children: [
                {
                    tag: "field", name: "EnableKey", xref: "core§11.12.7.4.1",
                    details: "This field shall have the same meaning and usage as the TestEventTrigger EnableKey field."
                },
                {
                    tag: "field", name: "Value", xref: "core§11.12.7.4.2",
                    details: "This field shall indicate the value to use in every byte of the PayloadTestResponse’s Payload field."
                },

                {
                    tag: "field", name: "Count", xref: "core§11.12.7.4.3",

                    details: "This field shall indicate the number of times to repeat the Value in the PayloadTestResponse’s " +
                        "Payload field." +
                        "\n" +
                        "### Effect upon receipt" +
                        "\n" +
                        "This command shall respond with a response status of CONSTRAINT_ERROR if either:" +
                        "\n" +
                        "  • The EnableKey field does not match the a-priori value configured on the device." +
                        "\n" +
                        "  • The TestEventTriggersEnabled field is currently false. Otherwise, the server shall respond with " +
                        "    a PayloadTestResponse command with a Payload field value containing Count instances of the Value " +
                        "    byte. If the response is too large to send, the server shall fail the command and respond with a " +
                        "    response status of RESOURCE_EXHAUSTED." +
                        "\n" +
                        "For example:" +
                        "\n" +
                        "  • If Value is 0x55 and the Count is zero, then the PayloadTestResponse would have the Payload " +
                        "    field set to an empty octet string." +
                        "\n" +
                        "  • If Value is 0xA5 and the Count is 10, the PayloadTestResponse would have the Payload field set " +
                        "    to a content whose hexadecimal representation would be A5A5A5A5A5A5A5A5A5A5, and base64 " +
                        "    representation would be paWlpaWlpaWlpQ==."
                }
            ]
        },

        {
            tag: "command", name: "PayloadTestResponse", xref: "core§11.12.7.5",
            details: "This command is sent by the server on receipt of the PayloadTestRequest command.",
            children: [{
                tag: "field", name: "Payload", xref: "core§11.12.7.5.1",
                details: "This field shall contain the computed response of the PayloadTestRequest command."
            }]
        },

        {
            tag: "datatype", name: "HardwareFaultEnum", xref: "core§11.12.5.1",

            children: [
                { tag: "field", name: "Unspecified", description: "The Node has encountered an unspecified fault." },
                {
                    tag: "field", name: "Radio",
                    description: "The Node has encountered a fault with at least one of its radios."
                },
                {
                    tag: "field", name: "Sensor",
                    description: "The Node has encountered a fault with at least one of its sensors."
                },
                {
                    tag: "field", name: "ResettableOverTemp",
                    description: "The Node has encountered an over-temperature fault that is resettable."
                },
                {
                    tag: "field", name: "NonResettableOverTemp",
                    description: "The Node has encountered an over-temperature fault that is not resettable."
                },
                {
                    tag: "field", name: "PowerSource",
                    description: "The Node has encountered a fault with at least one of its power sources."
                },
                {
                    tag: "field", name: "VisualDisplayFault",
                    description: "The Node has encountered a fault with at least one of its visual displays."
                },
                {
                    tag: "field", name: "AudioOutputFault",
                    description: "The Node has encountered a fault with at least one of its audio outputs."
                },
                {
                    tag: "field", name: "UserInterfaceFault",
                    description: "The Node has encountered a fault with at least one of its user interfaces."
                },
                {
                    tag: "field", name: "NonVolatileMemoryError",
                    description: "The Node has encountered a fault with its non-volatile memory."
                },
                {
                    tag: "field", name: "TamperDetected",
                    description: "The Node has encountered disallowed physical tampering."
                }
            ]
        },

        {
            tag: "datatype", name: "RadioFaultEnum", xref: "core§11.12.5.2",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "The Node has encountered an unspecified radio fault."
                },
                {
                    tag: "field", name: "WiFiFault",
                    description: "The Node has encountered a fault with its Wi-Fi radio."
                },
                {
                    tag: "field", name: "CellularFault",
                    description: "The Node has encountered a fault with its cellular radio."
                },
                {
                    tag: "field", name: "ThreadFault",
                    description: "The Node has encountered a fault with its802.15.4 radio."
                },
                { tag: "field", name: "NfcFault", description: "The Node has encountered a fault with its NFC radio." },
                { tag: "field", name: "BleFault", description: "The Node has encountered a fault with its BLE radio." },
                {
                    tag: "field", name: "EthernetFault",
                    description: "The Node has encountered a fault with its Ethernet controller."
                }
            ]
        },

        {
            tag: "datatype", name: "NetworkFaultEnum", xref: "core§11.12.5.3",

            children: [
                { tag: "field", name: "Unspecified", description: "The Node has encountered an unspecified fault." },
                {
                    tag: "field", name: "HardwareFailure",
                    description: "The Node has encountered a network fault as a result of a hardware failure."
                },
                {
                    tag: "field", name: "NetworkJammed",
                    description: "The Node has encountered a network fault as a result of a jammed network."
                },
                {
                    tag: "field", name: "ConnectionFailed",
                    description: "The Node has encountered a network fault as a result of a failure to establish a connection."
                }
            ]
        },

        {
            tag: "datatype", name: "InterfaceTypeEnum", xref: "core§11.12.5.4",

            children: [
                { tag: "field", name: "Unspecified", description: "Indicates an interface of an unspecified type." },
                { tag: "field", name: "WiFi", description: "Indicates a Wi-Fi interface." },
                { tag: "field", name: "Ethernet", description: "Indicates a Ethernet interface." },
                { tag: "field", name: "Cellular", description: "Indicates a Cellular interface." },
                { tag: "field", name: "Thread", description: "Indicates a Thread interface." }
            ]
        },

        {
            tag: "datatype", name: "BootReasonEnum", xref: "core§11.12.5.5",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "The Node is unable to identify the Power-On reason as one of the other provided enumeration values."
                },
                {
                    tag: "field", name: "PowerOnReboot",
                    description: "The Node has booted as the result of physical interaction with the device resulting in a reboot."
                },
                {
                    tag: "field", name: "BrownOutReset",
                    description: "The Node has rebooted as the result of a brown-out of the Node’s power supply."
                },
                {
                    tag: "field", name: "SoftwareWatchdogReset",
                    description: "The Node has rebooted as the result of a software watchdog timer."
                },
                {
                    tag: "field", name: "HardwareWatchdogReset",
                    description: "The Node has rebooted as the result of a hardware watchdog timer."
                },
                {
                    tag: "field", name: "SoftwareUpdateCompleted",
                    description: "The Node has rebooted as the result of a completed software update."
                },
                {
                    tag: "field", name: "SoftwareReset",
                    description: "The Node has rebooted as the result of a software initiated reboot."
                }
            ]
        },

        {
            tag: "datatype", name: "NetworkInterface", xref: "core§11.12.5.6",
            details: "This structure describes a network interface supported by the Node, as provided in the " +
                "NetworkInterfaces attribute.",

            children: [
                {
                    tag: "field", name: "Name", xref: "core§11.12.5.6.1",
                    details: "This field shall indicate a human-readable (displayable) name for the network interface, that is " +
                        "different from all other interfaces."
                },
                {
                    tag: "field", name: "IsOperational", xref: "core§11.12.5.6.2",
                    details: "This field shall indicate if the Node is currently advertising itself operationally on this network " +
                        "interface and is capable of successfully receiving incoming traffic from other Nodes."
                },

                {
                    tag: "field", name: "OffPremiseServicesReachableIPv4", xref: "core§11.12.5.6.3",
                    details: "This field shall indicate whether the Node is currently able to reach off-premise services it uses " +
                        "by utilizing IPv4. The value shall be null if the Node does not use such services or does not know " +
                        "whether it can reach them."
                },

                {
                    tag: "field", name: "OffPremiseServicesReachableIPv6", xref: "core§11.12.5.6.4",
                    details: "This field shall indicate whether the Node is currently able to reach off-premise services it uses " +
                        "by utilizing IPv6. The value shall be null if the Node does not use such services or does not know " +
                        "whether it can reach them."
                },

                {
                    tag: "field", name: "HardwareAddress", xref: "core§11.12.5.6.5",
                    details: "This field shall contain the current link-layer address for a 802.3 or IEEE 802.11-2020 network " +
                        "interface and contain the current extended MAC address for a 802.15.4 interface. The byte order of " +
                        "the octstr shall be in wire byte order. For addresses values less than 64 bits, the first two bytes " +
                        "shall be zero."
                },

                {
                    tag: "field", name: "IPv4Addresses", xref: "core§11.12.5.6.6",
                    details: "This field shall provide a list of the IPv4 addresses that are currently assigned to the network " +
                        "interface."
                },

                {
                    tag: "field", name: "IPv6Addresses", xref: "core§11.12.5.6.7",
                    details: "This field shall provide a list of the unicast IPv6 addresses that are currently assigned to the " +
                        "network interface. This list shall include the Node’s link-local address and SHOULD include any " +
                        "assigned GUA and ULA addresses. This list shall NOT include any multicast group addresses to which " +
                        "the Node is subscribed."
                },

                {
                    tag: "field", name: "Type", xref: "core§11.12.5.6.8",
                    details: "This field shall indicate the type of the interface using the InterfaceTypeEnum."
                }
            ]
        }
    ]
});
