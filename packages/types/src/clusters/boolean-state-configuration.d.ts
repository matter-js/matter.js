/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { BooleanStateConfiguration as BooleanStateConfigurationModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the BooleanStateConfiguration cluster.
 */
export declare namespace BooleanStateConfiguration {
    /**
     * {@link BooleanStateConfiguration} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates any faults registered by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.8
             */
            readonly sensorFault?: SensorFault;
        }

        export interface Events {
            /**
             * This event shall be generated when the device registers or clears a fault.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.2
             */
            sensorFault?: SensorFaultEvent;
        }
    }

    /**
     * {@link BooleanStateConfiguration} supports these elements if it supports feature "SensitivityLevel".
     */
    export namespace SensitivityLevelComponent {
        export interface Attributes {
            /**
             * Indicates the currently selected sensitivity level.
             *
             * If a write interaction to this attribute contains an unsupported sensitivity value, a CONSTRAINT_ERROR
             * status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.1
             */
            currentSensitivityLevel: number;

            /**
             * Indicates the number of supported sensitivity levels by the device.
             *
             * These supported sensitivity levels shall be ordered by sensitivity, where a value of 0 shall be
             * considered the lowest sensitivity level (least sensitive) and the highest supported value shall be
             * considered the highest sensitivity level. The number of supported sensitivity levels SHOULD represent
             * unique sensitivity levels supported by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.2
             */
            readonly supportedSensitivityLevels: number;

            /**
             * Indicates the default sensitivity level selected by the manufacturer.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.3
             */
            readonly defaultSensitivityLevel?: number;
        }
    }

    /**
     * {@link BooleanStateConfiguration} supports these elements if it supports feature "VisualOrAudible".
     */
    export namespace VisualOrAudibleComponent {
        export interface Attributes {
            /**
             * Indicates which specific alarm modes on the server are currently active. When the sensor is no longer
             * triggered, this attribute shall be set to the inactive state, by setting the bit to 0, for all supported
             * alarm modes.
             *
             * If an alarm mode is not supported, the bit indicating this alarm mode shall always be 0.
             *
             * A bit shall indicate whether the alarm mode inactive or not:
             *
             *   - 0 = Inactive
             *
             *   - 1 = Active
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.4
             */
            readonly alarmsActive: AlarmMode;

            /**
             * Indicates the alarms supported by the sensor.
             *
             * A bit shall indicate whether the alarm mode is supported:
             *
             *   - 0 = Not supported
             *
             *   - 1 = Supported
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.7
             */
            readonly alarmsSupported: AlarmMode;

            /**
             * Indicates the alarm modes that will be emitted if the sensor is triggered.
             *
             * If an alarm mode is not supported, the bit indicating this alarm mode shall always be 0.
             *
             * A bit shall indicate whether the alarm mode is enabled or disabled:
             *
             *   - 0 = Disabled
             *
             *   - 1 = Enabled
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.6
             */
            readonly alarmsEnabled?: AlarmMode;
        }

        export interface Commands {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.2
             */
            enableDisableAlarm(request: EnableDisableAlarmRequest): MaybePromise;
        }

        export interface Events {
            /**
             * This event shall be generated after any bits in the AlarmsActive and/or AlarmsSuppressed attributes
             * change. This may occur in situations such as when internal processing by the server determines that an
             * alarm mode becomes active or inactive, or when the SuppressAlarm or EnableDisableAlarm commands are
             * processed in a way that some alarm modes becomes suppressed, active or inactive.
             *
             * If several alarm modes change state at the same time, a single event combining multiple changes may be
             * emitted instead of multiple events each representing a single change.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.1
             */
            alarmsStateChanged: AlarmsStateChangedEvent;
        }
    }

    /**
     * {@link BooleanStateConfiguration} supports these elements if it supports feature "AlarmSuppress".
     */
    export namespace AlarmSuppressComponent {
        export interface Attributes {
            /**
             * Indicates which specific alarm modes on the server are currently suppressed. When the sensor is no longer
             * triggered, this attribute shall be set to the unsuppressed state, by setting the bit to 0, for all
             * supported alarm modes.
             *
             * If an alarm mode is not supported, the bit indicating this alarm mode shall always be 0.
             *
             * A bit shall indicate whether the alarm mode is suppressed or not:
             *
             *   - 0 = Not suppressed
             *
             *   - 1 = Suppressed
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.6.5
             */
            readonly alarmsSuppressed: AlarmMode;
        }

        export interface Commands {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.1
             */
            suppressAlarm(request: SuppressAlarmRequest): MaybePromise;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<SensitivityLevelComponent.Attributes>, Partial<VisualOrAudibleComponent.Attributes>, Partial<AlarmSuppressComponent.Attributes> {}
    export interface Commands extends VisualOrAudibleComponent.Commands, AlarmSuppressComponent.Commands {}
    export interface Events extends Base.Events, VisualOrAudibleComponent.Events {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        { flags: { sensitivityLevel: true }, attributes: SensitivityLevelComponent.Attributes },

        {
            flags: { visual: true },
            attributes: VisualOrAudibleComponent.Attributes,
            commands: VisualOrAudibleComponent.Commands,
            events: VisualOrAudibleComponent.Events
        },

        {
            flags: { audible: true },
            attributes: VisualOrAudibleComponent.Attributes,
            commands: VisualOrAudibleComponent.Commands,
            events: VisualOrAudibleComponent.Events
        },

        {
            flags: { alarmSuppress: true },
            attributes: AlarmSuppressComponent.Attributes,
            commands: AlarmSuppressComponent.Commands
        }
    ];

    export type Features = "Visual" | "Audible" | "AlarmSuppress" | "SensitivityLevel";

    /**
     * These are optional features supported by BooleanStateConfigurationCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.4
     */
    export enum Feature {
        /**
         * Visual (VIS)
         *
         * Supports visual alarms
         */
        Visual = "Visual",

        /**
         * Audible (AUD)
         *
         * Supports audible alarms
         */
        Audible = "Audible",

        /**
         * AlarmSuppress (SPRS)
         *
         * This feature shall indicate that the device is able to suppress the supported alarm modes, when the user
         * acknowledges the alarm. This is intended to stop visual and/or audible alarms, when the user has become aware
         * that the sensor is triggered, but it is no longer desired to have the alarm modes active on the device, e.g.:
         *
         *   - The triggering cause have been resolved by the user, but the sensor has not yet stopped detecting the
         *     triggering cause.
         *
         *   - The user is not able to address the triggering cause, but is aware of the alarm and suppress/acknowledge
         *     it be addressed at a later point.
         *
         * Acknowledge of alarms will for the remainder of this cluster be referred to as suppress.
         *
         * A suppressed alarm is still considered active and will remain so unless it is actively disabled or the
         * triggering condition is not longer present. The action of suppressing an alarm mode is only applicable to and
         * is intended to stop the physical alarming, e.g. emitting a sound or blinking a light; it does not impact
         * alarm reporting in AlarmsActive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.4.1
         */
        AlarmSuppress = "AlarmSuppress",

        /**
         * SensitivityLevel (SENSLVL)
         *
         * Supports ability to set sensor sensitivity
         */
        SensitivityLevel = "SensitivityLevel"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.5.2
     */
    export interface SensorFault {
        /**
         * Unspecified fault detected
         */
        generalFault?: boolean;
    }

    /**
     * This event shall be generated when the device registers or clears a fault.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.2
     */
    export interface SensorFaultEvent {
        /**
         * This field shall indicate the value of the SensorFault attribute, at the time this event is generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.2.1
         */
        sensorFault: SensorFault;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.5.1
     */
    export interface AlarmMode {
        /**
         * Visual alarming
         */
        visual?: boolean;

        /**
         * Audible alarming
         */
        audible?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.2
     */
    export interface EnableDisableAlarmRequest {
        /**
         * This field shall indicate the alarm modes to either enable or disable depending on the bit status, as
         * specified for the AlarmsEnabled attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.2.1
         */
        alarmsToEnableDisable: AlarmMode;
    }

    /**
     * This event shall be generated after any bits in the AlarmsActive and/or AlarmsSuppressed attributes change. This
     * may occur in situations such as when internal processing by the server determines that an alarm mode becomes
     * active or inactive, or when the SuppressAlarm or EnableDisableAlarm commands are processed in a way that some
     * alarm modes becomes suppressed, active or inactive.
     *
     * If several alarm modes change state at the same time, a single event combining multiple changes may be emitted
     * instead of multiple events each representing a single change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.1
     */
    export interface AlarmsStateChangedEvent {
        /**
         * This field shall indicate the state of active alarm modes, as indicated by the AlarmsActive attribute, at the
         * time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.1.1
         */
        alarmsActive: AlarmMode;

        /**
         * This field shall indicate the state of suppressed alarm modes, as indicated by the AlarmsSuppressed
         * attribute, at the time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.8.1.2
         */
        alarmsSuppressed?: AlarmMode;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.1
     */
    export interface SuppressAlarmRequest {
        /**
         * This field shall indicate the alarm modes to suppress.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.1.1
         */
        alarmsToSuppress: AlarmMode;
    }

    export const id: ClusterId;
    export const name: "BooleanStateConfiguration";
    export const revision: 1;
    export const schema: typeof BooleanStateConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof BooleanStateConfiguration;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `BooleanStateConfiguration` instead of
     * `BooleanStateConfiguration.Complete`)
     */
    export const Complete: typeof BooleanStateConfiguration;

    export const Typing: BooleanStateConfiguration;
}

export declare const BooleanStateConfigurationCluster: typeof BooleanStateConfiguration;
export interface BooleanStateConfiguration extends ClusterTyping { Attributes: BooleanStateConfiguration.Attributes; Commands: BooleanStateConfiguration.Commands; Events: BooleanStateConfiguration.Events; Features: BooleanStateConfiguration.Features; Components: BooleanStateConfiguration.Components }
