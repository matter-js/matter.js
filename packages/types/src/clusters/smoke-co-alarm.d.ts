/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the SmokeCoAlarm cluster.
 *
 * This cluster provides an interface for observing and managing the state of smoke and CO alarms.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.11
 */
export declare namespace SmokeCoAlarm {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x005c;

    /**
     * Textual cluster identifier.
     */
    export const name: "SmokeCoAlarm";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the SmokeCoAlarm cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link SmokeCoAlarm} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the visibly- and audibly-expressed state of the alarm. When multiple alarm conditions are being
         * reflected in the server, this attribute shall indicate the condition with the highest priority. Priority
         * order of conditions is determined by the manufacturer and shall be supplied as a part of certification
         * procedure. If the value of ExpressedState is not Normal, the attribute corresponding to the value shall NOT
         * be Normal. For example, if the ExpressedState is set to SmokeAlarm, the value of the SmokeState will indicate
         * the severity of the alarm (Warning or Critical). Clients SHOULD also read the other attributes to be aware of
         * further alarm conditions beyond the one indicated in ExpressedState.
         *
         * Visible expression is typically a LED light pattern. Audible expression is a horn or speaker pattern. Audible
         * expression shall BE suppressed if the DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.1
         */
        expressedState: ExpressedState;

        /**
         * Indicates whether the power resource fault detection mechanism is currently triggered at the device. If the
         * detection mechanism is triggered, this attribute shall be set to Warning or Critical, otherwise it shall be
         * set to Normal. The battery state shall also be reflected in the Power Source cluster representing the
         * device’s battery using the appropriate supported attributes and events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.4
         */
        batteryAlert: AlarmState;

        /**
         * Indicates whether the device self-test is currently activated. If the device self-test is activated, this
         * attribute shall be set to True, otherwise it shall be set to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.6
         */
        testInProgress: boolean;

        /**
         * Indicates whether the hardware fault detection mechanism is currently triggered. If the detection mechanism
         * is triggered, this attribute shall be set to True, otherwise it shall be set to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.7
         */
        hardwareFaultAlert: boolean;

        /**
         * Indicates whether the end-of-service has been triggered at the device. This attribute shall be set to Expired
         * when the device reaches the end-of-service.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.8
         */
        endOfServiceAlert: EndOfService;

        /**
         * Indicates the whether the audible expression of the device is currently muted. Audible expression is
         * typically a horn or speaker pattern.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.5
         */
        deviceMuted?: MuteState;

        /**
         * Indicates whether the interconnected smoke alarm is currently triggering by branching devices. When the
         * interconnected smoke alarm is being triggered, this attribute shall be set to Warning or Critical, otherwise
         * it shall be set to Normal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.9
         */
        interconnectSmokeAlarm?: AlarmState;

        /**
         * Indicates whether the interconnected CO alarm is currently triggering by branching devices. When the
         * interconnected CO alarm is being triggered, this attribute shall be set to Warning or Critical, otherwise it
         * shall be set to Normal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.10
         */
        interconnectCoAlarm?: AlarmState;

        /**
         * Indicates the date when the device reaches its stated expiry date. After the ExpiryDate has been reached, the
         * EndOfServiceAlert shall start to be triggered. To account for better customer experience across time zones,
         * the EndOfServiceAlert may be delayed by up to 24 hours after the ExpiryDate. Similarly, clients may delay any
         * actions based on the ExpiryDate by up to 24 hours to best align with the local time zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.13
         */
        expiryDate?: number;
    }

    /**
     * {@link SmokeCoAlarm} supports these elements if it supports feature "SmokeAlarm".
     */
    export interface SmokeAlarmAttributes {
        /**
         * Indicates whether the device’s smoke sensor is currently triggering a smoke alarm.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.2
         */
        smokeState: AlarmState;

        /**
         * Indicates the contamination level of the smoke sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.11
         */
        contaminationState?: ContaminationState;

        /**
         * Indicates the sensitivity level of the smoke sensor configured on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.12
         */
        smokeSensitivityLevel?: Sensitivity;
    }

    /**
     * {@link SmokeCoAlarm} supports these elements if it supports feature "CoAlarm".
     */
    export interface CoAlarmAttributes {
        /**
         * Indicates whether the device’s CO sensor is currently triggering a CO alarm.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.3
         */
        coState: AlarmState;
    }

    /**
     * Attributes that may appear in {@link SmokeCoAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the visibly- and audibly-expressed state of the alarm. When multiple alarm conditions are being
         * reflected in the server, this attribute shall indicate the condition with the highest priority. Priority
         * order of conditions is determined by the manufacturer and shall be supplied as a part of certification
         * procedure. If the value of ExpressedState is not Normal, the attribute corresponding to the value shall NOT
         * be Normal. For example, if the ExpressedState is set to SmokeAlarm, the value of the SmokeState will indicate
         * the severity of the alarm (Warning or Critical). Clients SHOULD also read the other attributes to be aware of
         * further alarm conditions beyond the one indicated in ExpressedState.
         *
         * Visible expression is typically a LED light pattern. Audible expression is a horn or speaker pattern. Audible
         * expression shall BE suppressed if the DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.1
         */
        expressedState: ExpressedState;

        /**
         * Indicates whether the power resource fault detection mechanism is currently triggered at the device. If the
         * detection mechanism is triggered, this attribute shall be set to Warning or Critical, otherwise it shall be
         * set to Normal. The battery state shall also be reflected in the Power Source cluster representing the
         * device’s battery using the appropriate supported attributes and events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.4
         */
        batteryAlert: AlarmState;

        /**
         * Indicates whether the device self-test is currently activated. If the device self-test is activated, this
         * attribute shall be set to True, otherwise it shall be set to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.6
         */
        testInProgress: boolean;

        /**
         * Indicates whether the hardware fault detection mechanism is currently triggered. If the detection mechanism
         * is triggered, this attribute shall be set to True, otherwise it shall be set to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.7
         */
        hardwareFaultAlert: boolean;

        /**
         * Indicates whether the end-of-service has been triggered at the device. This attribute shall be set to Expired
         * when the device reaches the end-of-service.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.8
         */
        endOfServiceAlert: EndOfService;

        /**
         * Indicates the whether the audible expression of the device is currently muted. Audible expression is
         * typically a horn or speaker pattern.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.5
         */
        deviceMuted: MuteState;

        /**
         * Indicates whether the interconnected smoke alarm is currently triggering by branching devices. When the
         * interconnected smoke alarm is being triggered, this attribute shall be set to Warning or Critical, otherwise
         * it shall be set to Normal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.9
         */
        interconnectSmokeAlarm: AlarmState;

        /**
         * Indicates whether the interconnected CO alarm is currently triggering by branching devices. When the
         * interconnected CO alarm is being triggered, this attribute shall be set to Warning or Critical, otherwise it
         * shall be set to Normal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.10
         */
        interconnectCoAlarm: AlarmState;

        /**
         * Indicates the date when the device reaches its stated expiry date. After the ExpiryDate has been reached, the
         * EndOfServiceAlert shall start to be triggered. To account for better customer experience across time zones,
         * the EndOfServiceAlert may be delayed by up to 24 hours after the ExpiryDate. Similarly, clients may delay any
         * actions based on the ExpiryDate by up to 24 hours to best align with the local time zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.13
         */
        expiryDate: number;

        /**
         * Indicates whether the device’s smoke sensor is currently triggering a smoke alarm.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.2
         */
        smokeState: AlarmState;

        /**
         * Indicates the contamination level of the smoke sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.11
         */
        contaminationState: ContaminationState;

        /**
         * Indicates the sensitivity level of the smoke sensor configured on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.12
         */
        smokeSensitivityLevel: Sensitivity;

        /**
         * Indicates whether the device’s CO sensor is currently triggering a CO alarm.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.6.3
         */
        coState: AlarmState;
    }

    /**
     * {@link SmokeCoAlarm} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall initiate a device self-test. The return status shall indicate whether the test was
         * successfully initiated. Only one SelfTestRequest may be processed at a time. When the value of the
         * ExpressedState attribute is any of SmokeAlarm, COAlarm, Testing, InterconnectSmoke, InterconnectCO, the
         * device shall NOT execute the self-test, and shall return status code BUSY.
         *
         * Upon successful acceptance of SelfTestRequest, the TestInProgress attribute shall be set to True and
         * ExpressedState attribute shall be set to Testing. Any faults identified during the test shall be reflected in
         * the appropriate attributes and events. Upon completion of the self test procedure, the SelfTestComplete event
         * shall be generated, the TestInProgress attribute shall be set to False and ExpressedState attribute shall be
         * updated to reflect the current state of the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.7.1
         */
        selfTestRequest(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link SmokeCoAlarm}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link SmokeCoAlarm} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when BatteryAlert attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.3
         */
        lowBattery: LowBatteryEvent;

        /**
         * This event shall be generated when the device detects a hardware fault that leads to setting
         * HardwareFaultAlert to True.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.4
         */
        hardwareFault: void;

        /**
         * This event shall be generated when the EndOfServiceAlert is set to Expired.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.5
         */
        endOfService: void;

        /**
         * This event shall be generated when the SelfTest completes, and the attribute TestInProgress changes to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.6
         */
        selfTestComplete: void;

        /**
         * This event shall be generated when ExpressedState attribute returns to Normal state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.11
         */
        allClear: void;

        /**
         * This event shall be generated when the DeviceMuted attribute changes to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.7
         */
        alarmMuted?: void;

        /**
         * This event shall be generated when DeviceMuted attribute changes to NotMuted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.8
         */
        muteEnded?: void;
    }

    /**
     * {@link SmokeCoAlarm} supports these elements if it supports feature "SmokeAlarm".
     */
    export interface SmokeAlarmEvents {
        /**
         * This event shall be generated when SmokeState attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.1
         */
        smokeAlarm: SmokeAlarmEvent;

        /**
         * This event shall be generated when the device hosting the server receives a smoke alarm from an
         * interconnected sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.9
         */
        interconnectSmokeAlarm?: InterconnectSmokeAlarmEvent;
    }

    /**
     * {@link SmokeCoAlarm} supports these elements if it supports feature "CoAlarm".
     */
    export interface CoAlarmEvents {
        /**
         * This event shall be generated when COState attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.2
         */
        coAlarm: CoAlarmEvent;

        /**
         * This event shall be generated when the device hosting the server receives a CO alarm from an interconnected
         * sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.10
         */
        interconnectCoAlarm?: InterconnectCoAlarmEvent;
    }

    /**
     * Events that may appear in {@link SmokeCoAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when BatteryAlert attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.3
         */
        lowBattery: LowBatteryEvent;

        /**
         * This event shall be generated when the device detects a hardware fault that leads to setting
         * HardwareFaultAlert to True.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.4
         */
        hardwareFault: void;

        /**
         * This event shall be generated when the EndOfServiceAlert is set to Expired.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.5
         */
        endOfService: void;

        /**
         * This event shall be generated when the SelfTest completes, and the attribute TestInProgress changes to False.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.6
         */
        selfTestComplete: void;

        /**
         * This event shall be generated when ExpressedState attribute returns to Normal state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.11
         */
        allClear: void;

        /**
         * This event shall be generated when the DeviceMuted attribute changes to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.7
         */
        alarmMuted: void;

        /**
         * This event shall be generated when DeviceMuted attribute changes to NotMuted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.8
         */
        muteEnded: void;

        /**
         * This event shall be generated when SmokeState attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.1
         */
        smokeAlarm: SmokeAlarmEvent;

        /**
         * This event shall be generated when the device hosting the server receives a smoke alarm from an
         * interconnected sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.9
         */
        interconnectSmokeAlarm: InterconnectSmokeAlarmEvent;

        /**
         * This event shall be generated when COState attribute changes to either Warning or Critical state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.2
         */
        coAlarm: CoAlarmEvent;

        /**
         * This event shall be generated when the device hosting the server receives a CO alarm from an interconnected
         * sensor.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.10
         */
        interconnectCoAlarm: InterconnectCoAlarmEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { smokeAlarm: true }, attributes: SmokeAlarmAttributes, events: SmokeAlarmEvents },
        { flags: { coAlarm: true }, attributes: CoAlarmAttributes, events: CoAlarmEvents }
    ];
    export type Features = "SmokeAlarm" | "CoAlarm";

    /**
     * These are optional features supported by SmokeCoAlarmCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.4
     */
    export enum Feature {
        /**
         * SmokeAlarm (SMOKE)
         *
         * Supports Smoke alarm
         */
        SmokeAlarm = "SmokeAlarm",

        /**
         * CoAlarm (CO)
         *
         * Supports CO alarm
         */
        CoAlarm = "CoAlarm"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3
     */
    export enum ExpressedState {
        /**
         * Nominal state, the device is not alarming
         *
         * This value shall indicate that this alarm is not alarming.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.1
         */
        Normal = 0,

        /**
         * Smoke Alarm state
         *
         * This value shall indicate that this alarm is currently expressing visual indication of Smoke Alarm. This
         * value shall indicate that the alarm is currently expressing audible indication of Smoke Alarm unless the
         * DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.2
         */
        SmokeAlarm = 1,

        /**
         * CO Alarm state
         *
         * This value shall indicate that this alarm is currently expressing visual indication of CO Alarm. This value
         * shall indicate that the alarm is currently expressing audible indication of CO Alarm unless the DeviceMuted
         * attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.3
         */
        CoAlarm = 2,

        /**
         * Battery Alert State
         *
         * This value shall indicate that this alarm is currently expressing visual indication of Critical Low Battery.
         * This value shall indicate that the alarm is currently expressing audible indication of Critical Low Battery
         * unless the DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.4
         */
        BatteryAlert = 3,

        /**
         * Test in Progress
         *
         * This value shall indicate that this alarm is currently expressing visual and audible indication of SelfTest.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.5
         */
        Testing = 4,

        /**
         * Hardware Fault Alert State
         *
         * This value shall indicate that this alarm is currently expressing visual indication of Hardware Fault. This
         * value shall indicate that the alarm is currently expressing audible indication of Hardware Fault unless the
         * DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.6
         */
        HardwareFault = 5,

        /**
         * End of Service Alert State
         *
         * This value shall indicate that this alarm is currently expressing visual indication of End Of Service. This
         * value shall indicate that the alarm is currently expressing audible indication of End of Service unless the
         * DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.7
         */
        EndOfService = 6,

        /**
         * Interconnected Smoke Alarm State
         *
         * This value shall indicate that this alarm is currently expressing visual indication of Smoke Alarm caused by
         * Interconnect. This value shall indicate that the alarm is currently expressing audible indication of Smoke
         * Alarm caused by Interconnect unless the DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.8
         */
        InterconnectSmoke = 7,

        /**
         * Interconnected CO Alarm State
         *
         * This value shall indicate that this alarm is currently expressing visual indication of CO Alarm caused by
         * Interconnect. This value shall indicate that the alarm is currently expressing audible indication of CO Alarm
         * caused by Interconnect unless the DeviceMuted attribute is supported and set to Muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.3.9
         */
        InterconnectCo = 8
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.1
     */
    export enum AlarmState {
        /**
         * Nominal state, the device is not alarming
         *
         * This value shall indicate that this alarm is not alarming.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.1.1
         */
        Normal = 0,

        /**
         * Warning state
         *
         * This value shall indicate that this alarm is in a warning state. Alarms in this state SHOULD be subject to
         * being muted via physical interaction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.1.2
         */
        Warning = 1,

        /**
         * Critical state
         *
         * This value shall indicate that this alarm is in a critical state. Alarms in this state shall NOT be subject
         * to being muted via physical interaction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.1.3
         */
        Critical = 2
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.5
     */
    export enum EndOfService {
        /**
         * Device has not expired
         *
         * This value shall indicate that the device has not yet reached its end of service, and does not need to be
         * imminently replaced.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.5.2
         */
        Normal = 0,

        /**
         * Device has reached its end of service
         *
         * This value shall indicate that the device has reached its end of service, and needs to be replaced.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.5.1
         */
        Expired = 1
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.4
     */
    export enum MuteState {
        /**
         * Not Muted
         *
         * This value shall indicate that the device is not muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.4.1
         */
        NotMuted = 0,

        /**
         * Muted
         *
         * This value shall indicate that the device is muted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.4.2
         */
        Muted = 1
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.6
     */
    export enum ContaminationState {
        /**
         * Nominal state, the sensor is not contaminated
         *
         * This value shall indicate that the smoke sensor has nominal contamination levels, no customer action is
         * required.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.6.1
         */
        Normal = 0,

        /**
         * Low contamination
         *
         * This value shall indicate that the smoke sensor has detectable contamination levels, but the contamination is
         * too low to cause a visible or audible alarm.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.6.2
         */
        Low = 1,

        /**
         * Warning state
         *
         * This value shall indicate that the smoke sensor has contamination levels in a warning state. At this level,
         * the contamination may cause a visible or audible alarm. User intervention is suggested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.6.3
         */
        Warning = 2,

        /**
         * Critical state, will cause nuisance alarms
         *
         * This value shall indicate that the smoke sensor has contamination levels in a critical state. At this level,
         * the contamination should cause a visible or audible alarm. User intervention is required. Critical
         * contamination of the sensor shall also be reflected as a HardwareFault.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.6.4
         */
        Critical = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.5.2
     */
    export enum Sensitivity {
        /**
         * High sensitivity
         */
        High = 0,

        /**
         * Standard Sensitivity
         */
        Standard = 1,

        /**
         * Low sensitivity
         */
        Low = 2
    }

    /**
     * This event shall be generated when BatteryAlert attribute changes to either Warning or Critical state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.3
     */
    export declare class LowBatteryEvent {
        constructor(values?: Partial<LowBatteryEvent>);

        /**
         * This field shall indicate the current value of the BatteryAlert attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.3.1
         */
        alarmSeverityLevel: AlarmState;
    };

    /**
     * This event shall be generated when SmokeState attribute changes to either Warning or Critical state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.1
     */
    export declare class SmokeAlarmEvent {
        constructor(values?: Partial<SmokeAlarmEvent>);

        /**
         * This field shall indicate the current value of the SmokeState attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.1.1
         */
        alarmSeverityLevel: AlarmState;
    };

    /**
     * This event shall be generated when the device hosting the server receives a smoke alarm from an interconnected
     * sensor.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.9
     */
    export declare class InterconnectSmokeAlarmEvent {
        constructor(values?: Partial<InterconnectSmokeAlarmEvent>);

        /**
         * This field shall indicate the current value of the InterconnectSmokeAlarm attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.9.1
         */
        alarmSeverityLevel: AlarmState;
    };

    /**
     * This event shall be generated when COState attribute changes to either Warning or Critical state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.2
     */
    export declare class CoAlarmEvent {
        constructor(values?: Partial<CoAlarmEvent>);

        /**
         * This field shall indicate the current value of the COState attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.2.1
         */
        alarmSeverityLevel: AlarmState;
    };

    /**
     * This event shall be generated when the device hosting the server receives a CO alarm from an interconnected
     * sensor.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.10
     */
    export declare class InterconnectCoAlarmEvent {
        constructor(values?: Partial<InterconnectCoAlarmEvent>);

        /**
         * This field shall indicate the current value of the InterconnectCOAlarm attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.11.8.10.1
         */
        alarmSeverityLevel: AlarmState;
    };

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
     * @deprecated Use {@link SmokeCoAlarm}.
     */
    export const Cluster: typeof SmokeCoAlarm;

    /**
     * @deprecated Use {@link SmokeCoAlarm}.
     */
    export const Complete: typeof SmokeCoAlarm;

    export const Typing: SmokeCoAlarm;
}

/**
 * @deprecated Use {@link SmokeCoAlarm}.
 */
export declare const SmokeCoAlarmCluster: typeof SmokeCoAlarm;

export interface SmokeCoAlarm extends ClusterTyping {
    Attributes: SmokeCoAlarm.Attributes;
    Commands: SmokeCoAlarm.Commands;
    Events: SmokeCoAlarm.Events;
    Features: SmokeCoAlarm.Features;
    Components: SmokeCoAlarm.Components;
}
