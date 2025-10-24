/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, Attribute, OptionalAttribute, TlvNoResponse, OptionalEvent, Event } from "../cluster/Cluster.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { TlvUInt8, TlvUInt16, TlvEnum, TlvUInt64, TlvUInt32, TlvSysTimeMS, TlvPosixMs } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace GeneralDiagnostics {
    /**
     * These are optional features supported by GeneralDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.4
     */
    export enum Feature {
        /**
         * DataModelTest (DMTEST)
         *
         * This feature indicates support for extended Data Model testing commands, which are required in some
         * situations.
         *
         * This feature shall be supported if the MaxPathsPerInvoke attribute of the Basic Information Cluster has a
         * value > 1.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.4.1
         */
        DataModelTest = "DataModelTest"
    }

    /**
     * Input to the GeneralDiagnostics payloadTestRequest command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.4
     */
    export const TlvPayloadTestRequest = TlvObject({
        /**
         * This field shall have the same meaning and usage as the TestEventTrigger EnableKey field.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.4.1
         */
        enableKey: TlvField(0, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the value to use in every byte of the PayloadTestResponse’s Payload field.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.4.2
         */
        value: TlvField(1, TlvUInt8),

        /**
         * This field shall indicate the number of times to repeat the Value in the PayloadTestResponse’s Payload field.
         *
         * ### Effect upon receipt
         *
         * This command shall respond with a response status of CONSTRAINT_ERROR if either:
         *
         *   • The EnableKey field does not match the a-priori value configured on the device.
         *
         *   • The TestEventTriggersEnabled field is currently false. Otherwise, the server shall respond with a
         *     PayloadTestResponse command with a Payload field value containing Count instances of the Value byte. If
         *     the response is too large to send, the server shall fail the command and respond with a response status
         *     of RESOURCE_EXHAUSTED.
         *
         * For example:
         *
         *   • If Value is 0x55 and the Count is zero, then the PayloadTestResponse would have the Payload field set to
         *     an empty octet string.
         *
         *   • If Value is 0xA5 and the Count is 10, the PayloadTestResponse would have the Payload field set to a
         *     content whose hexadecimal representation would be A5A5A5A5A5A5A5A5A5A5, and base64 representation would
         *     be paWlpaWlpaWlpQ==.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.4.3
         */
        count: TlvField(2, TlvUInt16.bound({ max: 2048 }))
    });

    /**
     * Input to the GeneralDiagnostics payloadTestRequest command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.4
     */
    export interface PayloadTestRequest extends TypeFromSchema<typeof TlvPayloadTestRequest> {}

    /**
     * This command is sent by the server on receipt of the PayloadTestRequest command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.5
     */
    export const TlvPayloadTestResponse = TlvObject({
        /**
         * This field shall contain the computed response of the PayloadTestRequest command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.5.1
         */
        payload: TlvField(0, TlvByteString.bound({ maxLength: 2048 }))
    });

    /**
     * This command is sent by the server on receipt of the PayloadTestRequest command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.5
     */
    export interface PayloadTestResponse extends TypeFromSchema<typeof TlvPayloadTestResponse> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.4
     */
    export enum InterfaceType {
        /**
         * Indicates an interface of an unspecified type.
         */
        Unspecified = 0,

        /**
         * Indicates a Wi-Fi interface.
         */
        WiFi = 1,

        /**
         * Indicates a Ethernet interface.
         */
        Ethernet = 2,

        /**
         * Indicates a Cellular interface.
         */
        Cellular = 3,

        /**
         * Indicates a Thread interface.
         */
        Thread = 4
    }

    /**
     * This structure describes a network interface supported by the Node, as provided in the NetworkInterfaces
     * attribute.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.6
     */
    export const TlvNetworkInterface = TlvObject({
        /**
         * This field shall indicate a human-readable (displayable) name for the network interface, that is different
         * from all other interfaces.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.1
         */
        name: TlvField(0, TlvString.bound({ maxLength: 32 })),

        /**
         * This field shall indicate if the Node is currently advertising itself operationally on this network interface
         * and is capable of successfully receiving incoming traffic from other Nodes.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.2
         */
        isOperational: TlvField(1, TlvBoolean),

        /**
         * This field shall indicate whether the Node is currently able to reach off-premise services it uses by
         * utilizing IPv4. The value shall be null if the Node does not use such services or does not know whether it
         * can reach them.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.3
         */
        offPremiseServicesReachableIPv4: TlvField(2, TlvNullable(TlvBoolean)),

        /**
         * This field shall indicate whether the Node is currently able to reach off-premise services it uses by
         * utilizing IPv6. The value shall be null if the Node does not use such services or does not know whether it
         * can reach them.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.4
         */
        offPremiseServicesReachableIPv6: TlvField(3, TlvNullable(TlvBoolean)),

        /**
         * This field shall contain the current link-layer address for a 802.3 or IEEE 802.11-2020 network interface and
         * contain the current extended MAC address for a 802.15.4 interface. The byte order of the octstr shall be in
         * wire byte order. For addresses values less than 64 bits, the first two bytes shall be zero.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.5
         */
        hardwareAddress: TlvField(4, TlvByteString),

        /**
         * This field shall provide a list of the IPv4 addresses that are currently assigned to the network interface.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.6
         */
        iPv4Addresses: TlvField(5, TlvArray(TlvByteString, { maxLength: 4 })),

        /**
         * This field shall provide a list of the unicast IPv6 addresses that are currently assigned to the network
         * interface. This list shall include the Node’s link-local address and SHOULD include any assigned GUA and ULA
         * addresses. This list shall NOT include any multicast group addresses to which the Node is subscribed.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.7
         */
        iPv6Addresses: TlvField(6, TlvArray(TlvByteString, { maxLength: 8 })),

        /**
         * This field shall indicate the type of the interface using the InterfaceTypeEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.5.6.8
         */
        type: TlvField(7, TlvEnum<InterfaceType>())
    });

    /**
     * This structure describes a network interface supported by the Node, as provided in the NetworkInterfaces
     * attribute.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.6
     */
    export interface NetworkInterface extends TypeFromSchema<typeof TlvNetworkInterface> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.5
     */
    export enum BootReason {
        /**
         * The Node is unable to identify the Power-On reason as one of the other provided enumeration values.
         */
        Unspecified = 0,

        /**
         * The Node has booted as the result of physical interaction with the device resulting in a reboot.
         */
        PowerOnReboot = 1,

        /**
         * The Node has rebooted as the result of a brown-out of the Node’s power supply.
         */
        BrownOutReset = 2,

        /**
         * The Node has rebooted as the result of a software watchdog timer.
         */
        SoftwareWatchdogReset = 3,

        /**
         * The Node has rebooted as the result of a hardware watchdog timer.
         */
        HardwareWatchdogReset = 4,

        /**
         * The Node has rebooted as the result of a completed software update.
         */
        SoftwareUpdateCompleted = 5,

        /**
         * The Node has rebooted as the result of a software initiated reboot.
         */
        SoftwareReset = 6
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.1
     */
    export enum HardwareFault {
        /**
         * The Node has encountered an unspecified fault.
         */
        Unspecified = 0,

        /**
         * The Node has encountered a fault with at least one of its radios.
         */
        Radio = 1,

        /**
         * The Node has encountered a fault with at least one of its sensors.
         */
        Sensor = 2,

        /**
         * The Node has encountered an over-temperature fault that is resettable.
         */
        ResettableOverTemp = 3,

        /**
         * The Node has encountered an over-temperature fault that is not resettable.
         */
        NonResettableOverTemp = 4,

        /**
         * The Node has encountered a fault with at least one of its power sources.
         */
        PowerSource = 5,

        /**
         * The Node has encountered a fault with at least one of its visual displays.
         */
        VisualDisplayFault = 6,

        /**
         * The Node has encountered a fault with at least one of its audio outputs.
         */
        AudioOutputFault = 7,

        /**
         * The Node has encountered a fault with at least one of its user interfaces.
         */
        UserInterfaceFault = 8,

        /**
         * The Node has encountered a fault with its non-volatile memory.
         */
        NonVolatileMemoryError = 9,

        /**
         * The Node has encountered disallowed physical tampering.
         */
        TamperDetected = 10
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.2
     */
    export enum RadioFault {
        /**
         * The Node has encountered an unspecified radio fault.
         */
        Unspecified = 0,

        /**
         * The Node has encountered a fault with its Wi-Fi radio.
         */
        WiFiFault = 1,

        /**
         * The Node has encountered a fault with its cellular radio.
         */
        CellularFault = 2,

        /**
         * The Node has encountered a fault with its802.15.4 radio.
         */
        ThreadFault = 3,

        /**
         * The Node has encountered a fault with its NFC radio.
         */
        NfcFault = 4,

        /**
         * The Node has encountered a fault with its BLE radio.
         */
        BleFault = 5,

        /**
         * The Node has encountered a fault with its Ethernet controller.
         */
        EthernetFault = 6
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.12.5.3
     */
    export enum NetworkFault {
        /**
         * The Node has encountered an unspecified fault.
         */
        Unspecified = 0,

        /**
         * The Node has encountered a network fault as a result of a hardware failure.
         */
        HardwareFailure = 1,

        /**
         * The Node has encountered a network fault as a result of a jammed network.
         */
        NetworkJammed = 2,

        /**
         * The Node has encountered a network fault as a result of a failure to establish a connection.
         */
        ConnectionFailed = 3
    }

    /**
     * Input to the GeneralDiagnostics testEventTrigger command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.1
     */
    export const TlvTestEventTriggerRequest = TlvObject({
        /**
         * The EnableKey is a 128 bit value provided by the client in this command, which needs to match a value chosen
         * by the manufacturer and configured on the server using manufacturer-specific means, such as pre-provisioning.
         * The value of all zeroes is reserved to indicate that no EnableKey is set. Therefore, if the EnableKey field
         * is received with all zeroes, this command shall FAIL with a response status of CONSTRAINT_ERROR.
         *
         * The EnableKey SHOULD be unique per exact set of devices going to a certification test.
         *
         * Devices not targeted towards going to a certification test event shall NOT have a non-zero EnableKey value
         * configured, so that only devices in test environments are responsive to this command.
         *
         * In order to prevent unwittingly actuating a particular trigger, this command shall respond with a response
         * status of CONSTRAINT_ERROR if the EnableKey field does not match the a-priori value configured on the device.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.1.1
         */
        enableKey: TlvField(0, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the test or test mode which the client wants to trigger.
         *
         * The expected side-effects of EventTrigger values are out of scope of this specification and will be described
         * within appropriate certification test literature provided to manufacturers by the Connectivity Standards
         * Alliance, in conjunction with certification test cases documentation.
         *
         * Values of EventTrigger in the range 0xFFFF_FFFF_0000_0000 through 0xFFFF_FFFF_FFFF_FFFF are reserved for
         * testing use by manufacturers and will not appear in the Connectivity Standards Alliance certification test
         * literature.
         *
         * If the value of EventTrigger received is not supported by the receiving Node, this command shall fail with a
         * status code of INVALID_COMMAND.
         *
         * Otherwise, if the EnableKey value matches the configured internal value for a particular Node, and the
         * EventTrigger value matches a supported test event trigger value, the command shall succeed and execute the
         * expected trigger action.
         *
         * If no specific test event triggers are required to be supported by certification test requirements for the
         * features that a given product will be certified against, this command may always fail with the
         * INVALID_COMMAND status, equivalent to the situation of receiving an unknown EventTrigger, for all possible
         * EventTrigger values.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.1.2
         */
        eventTrigger: TlvField(1, TlvUInt64)
    });

    /**
     * Input to the GeneralDiagnostics testEventTrigger command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.1
     */
    export interface TestEventTriggerRequest extends TypeFromSchema<typeof TlvTestEventTriggerRequest> {}

    /**
     * This command shall be generated in response to a TimeSnapshot command.
     *
     * When generating this response, all fields shall be gathered as close together in time as possible, so that the
     * time jitter between the values is minimized.
     *
     * If the Time Synchronization cluster is supported by the node, the PosixTimeMs field shall NOT be null unless the
     * UTCTime attribute in the Time Synchronization cluster is also null.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.3
     */
    export const TlvTimeSnapshotResponse = TlvObject({
        /**
         * This shall indicate the current System Time in milliseconds (type systime-ms), with the value taken at the
         * time of processing of the TimeSnapshot command that generated this response.
         *
         * The value shall be taken from the same clock which populates the Timestamp field in events when using System
         * Time for the field.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.3.1
         */
        systemTimeMs: TlvField(0, TlvSysTimeMS),

        /**
         * This shall indicate the current time in POSIX Time in milliseconds, with the value taken from the same source
         * that could populate the Timestamp field of events. This value shall only be null when any the following are
         * true:
         *
         *   • The node doesn’t support the Time Synchronization cluster.
         *
         *   • The node’s Time Synchronization cluster instance’s UTCTime attribute is null.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.7.3.2
         */
        posixTimeMs: TlvField(1, TlvNullable(TlvPosixMs))
    });

    /**
     * This command shall be generated in response to a TimeSnapshot command.
     *
     * When generating this response, all fields shall be gathered as close together in time as possible, so that the
     * time jitter between the values is minimized.
     *
     * If the Time Synchronization cluster is supported by the node, the PosixTimeMs field shall NOT be null unless the
     * UTCTime attribute in the Time Synchronization cluster is also null.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.7.3
     */
    export interface TimeSnapshotResponse extends TypeFromSchema<typeof TlvTimeSnapshotResponse> {}

    /**
     * Body of the GeneralDiagnostics hardwareFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.1
     */
    export const TlvHardwareFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per HardwareFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.1.1
         */
        current: TlvField(0, TlvArray(TlvEnum<HardwareFault>(), { maxLength: 11 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per HardwareFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.1.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<HardwareFault>(), { maxLength: 11 }))
    });

    /**
     * Body of the GeneralDiagnostics hardwareFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.1
     */
    export interface HardwareFaultChangeEvent extends TypeFromSchema<typeof TlvHardwareFaultChangeEvent> {}

    /**
     * Body of the GeneralDiagnostics radioFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.2
     */
    export const TlvRadioFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per RadioFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.2.1
         */
        current: TlvField(0, TlvArray(TlvEnum<RadioFault>(), { maxLength: 7 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per RadioFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.2.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<RadioFault>(), { maxLength: 7 }))
    });

    /**
     * Body of the GeneralDiagnostics radioFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.2
     */
    export interface RadioFaultChangeEvent extends TypeFromSchema<typeof TlvRadioFaultChangeEvent> {}

    /**
     * Body of the GeneralDiagnostics networkFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.3
     */
    export const TlvNetworkFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per NetworkFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.3.1
         */
        current: TlvField(0, TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per NetworkFaultEnum.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.3.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 }))
    });

    /**
     * Body of the GeneralDiagnostics networkFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.3
     */
    export interface NetworkFaultChangeEvent extends TypeFromSchema<typeof TlvNetworkFaultChangeEvent> {}

    /**
     * Body of the GeneralDiagnostics bootReason event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.4
     */
    export const TlvBootReasonEvent = TlvObject({
        /**
         * This field shall contain the reason for this BootReason event.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.12.8.4.1
         */
        bootReason: TlvField(0, TlvEnum<BootReason>())
    });

    /**
     * Body of the GeneralDiagnostics bootReason event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12.8.4
     */
    export interface BootReasonEvent extends TypeFromSchema<typeof TlvBootReasonEvent> {}

    /**
     * A GeneralDiagnosticsCluster supports these elements if it supports feature DataModelTest.
     */
    export const DataModelTestComponent = MutableCluster.Component({
        commands: {
            /**
             * This command provides a means for certification tests or manufacturer’s internal tests to validate
             * particular command handling and encoding constraints by generating a response of a given size.
             *
             * This command shall use the same EnableKey behavior as the TestEventTrigger command, whereby processing of
             * the command is only enabled when the TestEventTriggersEnabled field is true, which shall NOT be true
             * outside of certification testing or manufacturer’s internal tests.
             *
             * The fields for the PayloadTestRequest command are as follows:
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.7.4
             */
            payloadTestRequest: Command(
                0x3,
                TlvPayloadTestRequest,
                0x4,
                TlvPayloadTestResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * These elements and properties are present in all GeneralDiagnostics clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x33,
        name: "GeneralDiagnostics",
        revision: 2,

        features: {
            /**
             * This feature indicates support for extended Data Model testing commands, which are required in some
             * situations.
             *
             * This feature shall be supported if the MaxPathsPerInvoke attribute of the Basic Information Cluster has a
             * value > 1.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.4.1
             */
            dataModelTest: BitFlag(0)
        },

        attributes: {
            /**
             * The NetworkInterfaces attribute shall be a list of NetworkInterface structs. Each logical network
             * interface on the Node shall be represented by a single entry within the NetworkInterfaces attribute.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.1
             */
            networkInterfaces: Attribute(0x0, TlvArray(TlvNetworkInterface, { maxLength: 8 }), { default: [] }),

            /**
             * The RebootCount attribute shall indicate a best-effort count of the number of times the Node has
             * rebooted. The RebootCount attribute SHOULD be incremented each time the Node reboots. The RebootCount
             * attribute shall NOT be incremented when a Node wakes from a low-power or sleep state. The RebootCount
             * attribute shall only be reset to 0 upon a factory reset of the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.2
             */
            rebootCount: Attribute(0x1, TlvUInt16, { persistent: true }),

            /**
             * The UpTime attribute shall indicate a best-effort assessment of the length of time, in seconds, since the
             * Node’s last reboot. This attribute SHOULD be incremented to account for the periods of time that a Node
             * is in a low-power or sleep state. This attribute shall only be reset upon a device reboot. This attribute
             * shall be based on the same System Time source as those used to fulfill any usage of the systime-us and
             * systime-ms data types within the server.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.3
             */
            upTime: Attribute(0x2, TlvUInt64, { omitChanges: true }),

            /**
             * The TotalOperationalHours attribute shall indicate a best-effort attempt at tracking the length of time,
             * in hours, that the Node has been operational. The TotalOperationalHours attribute SHOULD be incremented
             * to account for the periods of time that a Node is in a low-power or sleep state. The
             * TotalOperationalHours attribute shall only be reset upon a factory reset of the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.4
             */
            totalOperationalHours: OptionalAttribute(0x3, TlvUInt32, { persistent: true, omitChanges: true }),

            /**
             * The BootReason attribute shall indicate the reason for the Node’s most recent boot.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.5
             */
            bootReason: OptionalAttribute(0x4, TlvEnum<BootReason>()),

            /**
             * The ActiveHardwareFaults attribute shall indicate the set of faults currently detected by the Node. When
             * the Node detects a fault has been raised, the appropriate HardwareFaultEnum value shall be added to this
             * list. This list shall NOT contain more than one instance of a specific HardwareFaultEnum value. When the
             * Node detects that all conditions contributing to a fault has been cleared, the corresponding
             * HardwareFaultEnum value shall be removed from this list. An empty list shall indicate there are currently
             * no active faults. The order of this list SHOULD have no significance. Clients interested in monitoring
             * changes in active faults may subscribe to this attribute, or they may subscribe to HardwareFaultChange.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.6
             */
            activeHardwareFaults: OptionalAttribute(
                0x5,
                TlvArray(TlvEnum<HardwareFault>(), { maxLength: 11 }),
                { default: [] }
            ),

            /**
             * The ActiveRadioFaults attribute shall indicate the set of faults currently detected by the Node. When the
             * Node detects a fault has been raised, the appropriate RadioFaultEnum value shall be added to this list.
             * This list shall NOT contain more than one instance of a specific RadioFaultEnum value. When the Node
             * detects that all conditions contributing to a fault has been cleared, the corresponding RadioFaultEnum
             * value shall be removed from this list. An empty list shall indicate there are currently no active faults.
             * The order of this list SHOULD have no significance. Clients interested in monitoring changes in active
             * faults may subscribe to this attribute, or they may subscribe to RadioFaultChange.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.7
             */
            activeRadioFaults: OptionalAttribute(
                0x6,
                TlvArray(TlvEnum<RadioFault>(), { maxLength: 7 }),
                { default: [] }
            ),

            /**
             * The ActiveNetworkFaults attribute shall indicate the set of faults currently detected by the Node. When
             * the Node detects a fault has been raised, the appropriate NetworkFaultEnum value shall be added to this
             * list. This list shall NOT contain more than one instance of a specific NetworkFaultEnum value. When the
             * Node detects that all conditions contributing to a fault has been cleared, the corresponding
             * NetworkFaultEnum value shall be removed from this list. An empty list shall indicate there are currently
             * no active faults. The order of this list SHOULD have no significance. Clients interested in monitoring
             * changes in active faults may subscribe to this attribute, or they may subscribe to NetworkFaultChange.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.8
             */
            activeNetworkFaults: OptionalAttribute(
                0x7,
                TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 }),
                { default: [] }
            ),

            /**
             * The TestEventTriggersEnabled attribute shall indicate whether the Node has any TestEventTrigger
             * configured. When this attribute is true, the Node has been configured with one or more test event
             * triggers by virtue of the internally programmed EnableKey value (see Section 11.12.7.1, “TestEventTrigger
             * Command”) being set to a non-zero value. This attribute can be used by Administrators to detect if a
             * device was inadvertently commissioned with test event trigger mode enabled, and take appropriate action
             * (e.g. warn the user and/or offer to remove all fabrics on the Node).
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.6.9
             */
            testEventTriggersEnabled: Attribute(0x8, TlvBoolean)
        },

        commands: {
            /**
             * This command shall be supported to provide a means for certification tests to trigger some
             * test-plan-specific events, necessary to assist in automation of device interactions for some
             * certification test cases. This command shall NOT cause any changes to the state of the device that
             * persist after the last fabric is removed.
             *
             * The fields for the TestEventTrigger command are as follows:
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.7.1
             */
            testEventTrigger: Command(
                0x0,
                TlvTestEventTriggerRequest,
                0x0,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command may be used by a client to obtain a correlated view of both System Time, and, if currently
             * synchronized and supported, "wall clock time" of the server. This can help clients establish time
             * correlation between their concept of time and the server’s concept of time. This is especially useful
             * when processing event histories where some events only contain System Time.
             *
             * Upon command invocation, the server shall respond with a TimeSnapshotResponse.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.7.2
             */
            timeSnapshot: Command(0x1, TlvNoArguments, 0x2, TlvTimeSnapshotResponse)
        },

        events: {
            /**
             * The HardwareFaultChange Event shall indicate a change in the set of hardware faults currently detected by
             * the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.8.1
             */
            hardwareFaultChange: OptionalEvent(0x0, Priority.Critical, TlvHardwareFaultChangeEvent),

            /**
             * The RadioFaultChange Event shall indicate a change in the set of radio faults currently detected by the
             * Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.8.2
             */
            radioFaultChange: OptionalEvent(0x1, Priority.Critical, TlvRadioFaultChangeEvent),

            /**
             * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by
             * the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.8.3
             */
            networkFaultChange: OptionalEvent(0x2, Priority.Critical, TlvNetworkFaultChangeEvent),

            /**
             * The BootReason Event shall indicate the reason that caused the device to start-up.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.12.8.4
             */
            bootReason: Event(0x3, Priority.Critical, TlvBootReasonEvent)
        },

        /**
         * This metadata controls which GeneralDiagnosticsCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { dataModelTest: true }, component: DataModelTestComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The General Diagnostics Cluster, along with other diagnostics clusters, provide a means to acquire standardized
     * diagnostics metrics that may be used by a Node to assist a user or Administrator in diagnosing potential
     * problems. The General Diagnostics Cluster attempts to centralize all metrics that are broadly relevant to the
     * majority of Nodes.
     *
     * GeneralDiagnosticsCluster supports optional features that you can enable with the
     * GeneralDiagnosticsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.12
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const DMTEST = { dataModelTest: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,
        attributes: Cluster.attributes,

        commands: {
            ...Cluster.commands,
            payloadTestRequest: MutableCluster.AsConditional(
                DataModelTestComponent.commands.payloadTestRequest,
                { mandatoryIf: [DMTEST] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all GeneralDiagnostics features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type GeneralDiagnosticsCluster = GeneralDiagnostics.Cluster;
export const GeneralDiagnosticsCluster = GeneralDiagnostics.Cluster;
ClusterRegistry.register(GeneralDiagnostics.Complete);
