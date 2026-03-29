/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";

/**
 * Definitions for the GeneralDiagnostics cluster.
 *
 * The General Diagnostics Cluster, along with other diagnostics clusters, provide a means to acquire standardized
 * diagnostics metrics that may be used by a Node to assist a user or Administrator in diagnosing potential problems.
 * The General Diagnostics Cluster attempts to centralize all metrics that are broadly relevant to the majority of
 * Nodes.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.12
 */
export declare namespace GeneralDiagnostics {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0033;

    /**
     * Textual cluster identifier.
     */
    export const name: "GeneralDiagnostics";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the GeneralDiagnostics cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link GeneralDiagnostics} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * The NetworkInterfaces attribute shall be a list of NetworkInterface structs. Each logical network interface
         * on the Node shall be represented by a single entry within the NetworkInterfaces attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.1
         */
        networkInterfaces: NetworkInterface[];

        /**
         * The RebootCount attribute shall indicate a best-effort count of the number of times the Node has rebooted.
         * The RebootCount attribute SHOULD be incremented each time the Node reboots. The RebootCount attribute shall
         * NOT be incremented when a Node wakes from a low-power or sleep state. The RebootCount attribute shall only be
         * reset to 0 upon a factory reset of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.2
         */
        rebootCount: number;

        /**
         * The UpTime attribute shall indicate a best-effort assessment of the length of time, in seconds, since the
         * Node’s last reboot. This attribute SHOULD be incremented to account for the periods of time that a Node is in
         * a low-power or sleep state. This attribute shall only be reset upon a device reboot. This attribute shall be
         * based on the same System Time source as those used to fulfill any usage of the systime-us and systime-ms data
         * types within the server.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.3
         */
        upTime: number | bigint;

        /**
         * The TestEventTriggersEnabled attribute shall indicate whether the Node has any TestEventTrigger configured.
         * When this attribute is true, the Node has been configured with one or more test event triggers by virtue of
         * the internally programmed EnableKey value (see Section 11.12.7.1, “TestEventTrigger Command”) being set to a
         * non-zero value. This attribute can be used by Administrators to detect if a device was inadvertently
         * commissioned with test event trigger mode enabled, and take appropriate action (e.g. warn the user and/or
         * offer to remove all fabrics on the Node).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.9
         */
        testEventTriggersEnabled: boolean;

        /**
         * The TotalOperationalHours attribute shall indicate a best-effort attempt at tracking the length of time, in
         * hours, that the Node has been operational. The TotalOperationalHours attribute SHOULD be incremented to
         * account for the periods of time that a Node is in a low-power or sleep state. The TotalOperationalHours
         * attribute shall only be reset upon a factory reset of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.4
         */
        totalOperationalHours?: number;

        /**
         * The BootReason attribute shall indicate the reason for the Node’s most recent boot.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.5
         */
        bootReason?: BootReason;

        /**
         * The ActiveHardwareFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate HardwareFaultEnum value shall be added to this list.
         * This list shall NOT contain more than one instance of a specific HardwareFaultEnum value. When the Node
         * detects that all conditions contributing to a fault has been cleared, the corresponding HardwareFaultEnum
         * value shall be removed from this list. An empty list shall indicate there are currently no active faults. The
         * order of this list SHOULD have no significance. Clients interested in monitoring changes in active faults may
         * subscribe to this attribute, or they may subscribe to HardwareFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.6
         */
        activeHardwareFaults?: HardwareFault[];

        /**
         * The ActiveRadioFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate RadioFaultEnum value shall be added to this list. This
         * list shall NOT contain more than one instance of a specific RadioFaultEnum value. When the Node detects that
         * all conditions contributing to a fault has been cleared, the corresponding RadioFaultEnum value shall be
         * removed from this list. An empty list shall indicate there are currently no active faults. The order of this
         * list SHOULD have no significance. Clients interested in monitoring changes in active faults may subscribe to
         * this attribute, or they may subscribe to RadioFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.7
         */
        activeRadioFaults?: RadioFault[];

        /**
         * The ActiveNetworkFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate NetworkFaultEnum value shall be added to this list.
         * This list shall NOT contain more than one instance of a specific NetworkFaultEnum value. When the Node
         * detects that all conditions contributing to a fault has been cleared, the corresponding NetworkFaultEnum
         * value shall be removed from this list. An empty list shall indicate there are currently no active faults. The
         * order of this list SHOULD have no significance. Clients interested in monitoring changes in active faults may
         * subscribe to this attribute, or they may subscribe to NetworkFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.8
         */
        activeNetworkFaults?: NetworkFault[];
    }

    /**
     * Attributes that may appear in {@link GeneralDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * The NetworkInterfaces attribute shall be a list of NetworkInterface structs. Each logical network interface
         * on the Node shall be represented by a single entry within the NetworkInterfaces attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.1
         */
        networkInterfaces: NetworkInterface[];

        /**
         * The RebootCount attribute shall indicate a best-effort count of the number of times the Node has rebooted.
         * The RebootCount attribute SHOULD be incremented each time the Node reboots. The RebootCount attribute shall
         * NOT be incremented when a Node wakes from a low-power or sleep state. The RebootCount attribute shall only be
         * reset to 0 upon a factory reset of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.2
         */
        rebootCount: number;

        /**
         * The UpTime attribute shall indicate a best-effort assessment of the length of time, in seconds, since the
         * Node’s last reboot. This attribute SHOULD be incremented to account for the periods of time that a Node is in
         * a low-power or sleep state. This attribute shall only be reset upon a device reboot. This attribute shall be
         * based on the same System Time source as those used to fulfill any usage of the systime-us and systime-ms data
         * types within the server.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.3
         */
        upTime: number | bigint;

        /**
         * The TestEventTriggersEnabled attribute shall indicate whether the Node has any TestEventTrigger configured.
         * When this attribute is true, the Node has been configured with one or more test event triggers by virtue of
         * the internally programmed EnableKey value (see Section 11.12.7.1, “TestEventTrigger Command”) being set to a
         * non-zero value. This attribute can be used by Administrators to detect if a device was inadvertently
         * commissioned with test event trigger mode enabled, and take appropriate action (e.g. warn the user and/or
         * offer to remove all fabrics on the Node).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.9
         */
        testEventTriggersEnabled: boolean;

        /**
         * The TotalOperationalHours attribute shall indicate a best-effort attempt at tracking the length of time, in
         * hours, that the Node has been operational. The TotalOperationalHours attribute SHOULD be incremented to
         * account for the periods of time that a Node is in a low-power or sleep state. The TotalOperationalHours
         * attribute shall only be reset upon a factory reset of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.4
         */
        totalOperationalHours: number;

        /**
         * The BootReason attribute shall indicate the reason for the Node’s most recent boot.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.5
         */
        bootReason: BootReason;

        /**
         * The ActiveHardwareFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate HardwareFaultEnum value shall be added to this list.
         * This list shall NOT contain more than one instance of a specific HardwareFaultEnum value. When the Node
         * detects that all conditions contributing to a fault has been cleared, the corresponding HardwareFaultEnum
         * value shall be removed from this list. An empty list shall indicate there are currently no active faults. The
         * order of this list SHOULD have no significance. Clients interested in monitoring changes in active faults may
         * subscribe to this attribute, or they may subscribe to HardwareFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.6
         */
        activeHardwareFaults: HardwareFault[];

        /**
         * The ActiveRadioFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate RadioFaultEnum value shall be added to this list. This
         * list shall NOT contain more than one instance of a specific RadioFaultEnum value. When the Node detects that
         * all conditions contributing to a fault has been cleared, the corresponding RadioFaultEnum value shall be
         * removed from this list. An empty list shall indicate there are currently no active faults. The order of this
         * list SHOULD have no significance. Clients interested in monitoring changes in active faults may subscribe to
         * this attribute, or they may subscribe to RadioFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.7
         */
        activeRadioFaults: RadioFault[];

        /**
         * The ActiveNetworkFaults attribute shall indicate the set of faults currently detected by the Node. When the
         * Node detects a fault has been raised, the appropriate NetworkFaultEnum value shall be added to this list.
         * This list shall NOT contain more than one instance of a specific NetworkFaultEnum value. When the Node
         * detects that all conditions contributing to a fault has been cleared, the corresponding NetworkFaultEnum
         * value shall be removed from this list. An empty list shall indicate there are currently no active faults. The
         * order of this list SHOULD have no significance. Clients interested in monitoring changes in active faults may
         * subscribe to this attribute, or they may subscribe to NetworkFaultChange.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.6.8
         */
        activeNetworkFaults: NetworkFault[];
    }

    /**
     * {@link GeneralDiagnostics} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall be supported to provide a means for certification tests to trigger some test-plan-specific
         * events, necessary to assist in automation of device interactions for some certification test cases. This
         * command shall NOT cause any changes to the state of the device that persist after the last fabric is removed.
         *
         * The fields for the TestEventTrigger command are as follows:
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.1
         */
        testEventTrigger(request: TestEventTriggerRequest): MaybePromise;

        /**
         * This command may be used by a client to obtain a correlated view of both System Time, and, if currently
         * synchronized and supported, "wall clock time" of the server. This can help clients establish time correlation
         * between their concept of time and the server’s concept of time. This is especially useful when processing
         * event histories where some events only contain System Time.
         *
         * Upon command invocation, the server shall respond with a TimeSnapshotResponse.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.2
         */
        timeSnapshot(): MaybePromise<TimeSnapshotResponse>;
    }

    /**
     * {@link GeneralDiagnostics} supports these elements if it supports feature "DataModelTest".
     */
    export interface DataModelTestCommands {
        /**
         * This command provides a means for certification tests or manufacturer’s internal tests to validate particular
         * command handling and encoding constraints by generating a response of a given size.
         *
         * This command shall use the same EnableKey behavior as the TestEventTrigger command, whereby processing of the
         * command is only enabled when the TestEventTriggersEnabled field is true, which shall NOT be true outside of
         * certification testing or manufacturer’s internal tests.
         *
         * The fields for the PayloadTestRequest command are as follows:
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.4
         */
        payloadTestRequest(request: PayloadTestRequest): MaybePromise<PayloadTestResponse>;
    }

    /**
     * Commands that may appear in {@link GeneralDiagnostics}.
     */
    export interface Commands extends
        BaseCommands,
        DataModelTestCommands
    {}

    /**
     * {@link GeneralDiagnostics} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * The BootReason Event shall indicate the reason that caused the device to start-up.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.4
         */
        bootReason: BootReasonEvent;

        /**
         * The HardwareFaultChange Event shall indicate a change in the set of hardware faults currently detected by the
         * Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.1
         */
        hardwareFaultChange?: HardwareFaultChangeEvent;

        /**
         * The RadioFaultChange Event shall indicate a change in the set of radio faults currently detected by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.2
         */
        radioFaultChange?: RadioFaultChangeEvent;

        /**
         * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by the
         * Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.3
         */
        networkFaultChange?: NetworkFaultChangeEvent;
    }

    /**
     * Events that may appear in {@link GeneralDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * The BootReason Event shall indicate the reason that caused the device to start-up.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.4
         */
        bootReason: BootReasonEvent;

        /**
         * The HardwareFaultChange Event shall indicate a change in the set of hardware faults currently detected by the
         * Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.1
         */
        hardwareFaultChange: HardwareFaultChangeEvent;

        /**
         * The RadioFaultChange Event shall indicate a change in the set of radio faults currently detected by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.2
         */
        radioFaultChange: RadioFaultChangeEvent;

        /**
         * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by the
         * Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.3
         */
        networkFaultChange: NetworkFaultChangeEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { dataModelTest: true }, commands: DataModelTestCommands }
    ];
    export type Features = "DataModelTest";

    /**
     * These are optional features supported by GeneralDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.4
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
         * @see {@link MatterSpecification.v142.Core} § 11.12.4.1
         */
        DataModelTest = "DataModelTest"
    }

    /**
     * This structure describes a network interface supported by the Node, as provided in the NetworkInterfaces
     * attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.6
     */
    export declare class NetworkInterface {
        constructor(values?: Partial<NetworkInterface>);

        /**
         * This field shall indicate a human-readable (displayable) name for the network interface, that is different
         * from all other interfaces.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.1
         */
        name: string;

        /**
         * This field shall indicate if the Node is currently advertising itself operationally on this network interface
         * and is capable of successfully receiving incoming traffic from other Nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.2
         */
        isOperational: boolean;

        /**
         * This field shall indicate whether the Node is currently able to reach off-premise services it uses by
         * utilizing IPv4. The value shall be null if the Node does not use such services or does not know whether it
         * can reach them.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.3
         */
        offPremiseServicesReachableIPv4: boolean | null;

        /**
         * This field shall indicate whether the Node is currently able to reach off-premise services it uses by
         * utilizing IPv6. The value shall be null if the Node does not use such services or does not know whether it
         * can reach them.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.4
         */
        offPremiseServicesReachableIPv6: boolean | null;

        /**
         * This field shall contain the current link-layer address for a 802.3 or IEEE 802.11-2020 network interface and
         * contain the current extended MAC address for a 802.15.4 interface. The byte order of the octstr shall be in
         * wire byte order. For addresses values less than 64 bits, the first two bytes shall be zero.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.5
         */
        hardwareAddress: Bytes;

        /**
         * This field shall provide a list of the IPv4 addresses that are currently assigned to the network interface.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.6
         */
        iPv4Addresses: Bytes[];

        /**
         * This field shall provide a list of the unicast IPv6 addresses that are currently assigned to the network
         * interface. This list shall include the Node’s link-local address and SHOULD include any assigned GUA and ULA
         * addresses. This list shall NOT include any multicast group addresses to which the Node is subscribed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.7
         */
        iPv6Addresses: Bytes[];

        /**
         * This field shall indicate the type of the interface using the InterfaceTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.5.6.8
         */
        type: InterfaceType;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.5
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
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.1
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
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.2
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
         * The Node has encountered a fault with its 802.15.4 radio.
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
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.3
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
     * This command shall be supported to provide a means for certification tests to trigger some test-plan-specific
     * events, necessary to assist in automation of device interactions for some certification test cases. This command
     * shall NOT cause any changes to the state of the device that persist after the last fabric is removed.
     *
     * The fields for the TestEventTrigger command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.7.1
     */
    export declare class TestEventTriggerRequest {
        constructor(values?: Partial<TestEventTriggerRequest>);

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
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.1.1
         */
        enableKey: Bytes;

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
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.1.2
         */
        eventTrigger: number | bigint;
    };

    /**
     * This command shall be generated in response to a TimeSnapshot command.
     *
     * When generating this response, all fields shall be gathered as close together in time as possible, so that the
     * time jitter between the values is minimized.
     *
     * If the Time Synchronization cluster is supported by the node, the PosixTimeMs field shall NOT be null unless the
     * UTCTime attribute in the Time Synchronization cluster is also null.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.7.3
     */
    export declare class TimeSnapshotResponse {
        constructor(values?: Partial<TimeSnapshotResponse>);

        /**
         * This shall indicate the current System Time in milliseconds (type systime-ms), with the value taken at the
         * time of processing of the TimeSnapshot command that generated this response.
         *
         * The value shall be taken from the same clock which populates the Timestamp field in events when using System
         * Time for the field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.3.1
         */
        systemTimeMs: number | bigint;

        /**
         * This shall indicate the current time in POSIX Time in milliseconds, with the value taken from the same source
         * that could populate the Timestamp field of events. This value shall only be null when any the following are
         * true:
         *
         *   - The node doesn’t support the Time Synchronization cluster.
         *
         *   - The node’s Time Synchronization cluster instance’s UTCTime attribute is null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.3.2
         */
        posixTimeMs: number | bigint | null;
    };

    /**
     * This command provides a means for certification tests or manufacturer’s internal tests to validate particular
     * command handling and encoding constraints by generating a response of a given size.
     *
     * This command shall use the same EnableKey behavior as the TestEventTrigger command, whereby processing of the
     * command is only enabled when the TestEventTriggersEnabled field is true, which shall NOT be true outside of
     * certification testing or manufacturer’s internal tests.
     *
     * The fields for the PayloadTestRequest command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.7.4
     */
    export declare class PayloadTestRequest {
        constructor(values?: Partial<PayloadTestRequest>);

        /**
         * This field shall have the same meaning and usage as the TestEventTrigger EnableKey field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.4.1
         */
        enableKey: Bytes;

        /**
         * This field shall indicate the value to use in every byte of the PayloadTestResponse’s Payload field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.4.2
         */
        value: number;

        /**
         * This field shall indicate the number of times to repeat the Value in the PayloadTestResponse’s Payload field.
         *
         * ### Effect upon receipt
         *
         * This command shall respond with a response status of CONSTRAINT_ERROR if either:
         *
         *   - The EnableKey field does not match the a-priori value configured on the device.
         *
         *   - The TestEventTriggersEnabled field is currently false.
         *
         * Otherwise, the server shall respond with a PayloadTestResponse command with a Payload field value containing
         * Count instances of the Value byte. If the response is too large to send, the server shall fail the command
         * and respond with a response status of RESOURCE_EXHAUSTED.
         *
         * For example:
         *
         *   - If Value is 0x55 and the Count is zero, then the PayloadTestResponse would have the Payload field set to
         *     an empty octet string.
         *
         *   - If Value is 0xA5 and the Count is 10, the PayloadTestResponse would have the Payload field set to a
         *     content whose hexadecimal representation would be A5A5A5A5A5A5A5A5A5A5, and base64 representation would
         *     be paWlpaWlpaWlpQ==.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.4.3
         */
        count: number;
    };

    /**
     * This command is sent by the server on receipt of the PayloadTestRequest command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.7.5
     */
    export declare class PayloadTestResponse {
        constructor(values?: Partial<PayloadTestResponse>);

        /**
         * This field shall contain the computed response of the PayloadTestRequest command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.7.5.1
         */
        payload: Bytes;
    };

    /**
     * The BootReason Event shall indicate the reason that caused the device to start-up.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.8.4
     */
    export declare class BootReasonEvent {
        constructor(values?: Partial<BootReasonEvent>);

        /**
         * This field shall contain the reason for this BootReason event.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.4.1
         */
        bootReason: BootReason;
    };

    /**
     * The HardwareFaultChange Event shall indicate a change in the set of hardware faults currently detected by the
     * Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.8.1
     */
    export declare class HardwareFaultChangeEvent {
        constructor(values?: Partial<HardwareFaultChangeEvent>);

        /**
         * This field shall represent the set of faults currently detected, as per HardwareFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.1.1
         */
        current: HardwareFault[];

        /**
         * This field shall represent the set of faults detected prior to this change event, as per HardwareFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.1.2
         */
        previous: HardwareFault[];
    };

    /**
     * The RadioFaultChange Event shall indicate a change in the set of radio faults currently detected by the Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.8.2
     */
    export declare class RadioFaultChangeEvent {
        constructor(values?: Partial<RadioFaultChangeEvent>);

        /**
         * This field shall represent the set of faults currently detected, as per RadioFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.2.1
         */
        current: RadioFault[];

        /**
         * This field shall represent the set of faults detected prior to this change event, as per RadioFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.2.2
         */
        previous: RadioFault[];
    };

    /**
     * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by the Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.12.8.3
     */
    export declare class NetworkFaultChangeEvent {
        constructor(values?: Partial<NetworkFaultChangeEvent>);

        /**
         * This field shall represent the set of faults currently detected, as per NetworkFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.3.1
         */
        current: NetworkFault[];

        /**
         * This field shall represent the set of faults detected prior to this change event, as per NetworkFaultEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.12.8.3.2
         */
        previous: NetworkFault[];
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.12.5.4
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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link GeneralDiagnostics}.
     */
    export const Cluster: typeof GeneralDiagnostics;

    /**
     * @deprecated Use {@link GeneralDiagnostics}.
     */
    export const Complete: typeof GeneralDiagnostics;

    export const Typing: GeneralDiagnostics;
}

/**
 * @deprecated Use {@link GeneralDiagnostics}.
 */
export declare const GeneralDiagnosticsCluster: typeof GeneralDiagnostics;

export interface GeneralDiagnostics extends ClusterTyping {
    Attributes: GeneralDiagnostics.Attributes;
    Commands: GeneralDiagnostics.Commands;
    Events: GeneralDiagnostics.Events;
    Features: GeneralDiagnostics.Features;
    Components: GeneralDiagnostics.Components;
}
