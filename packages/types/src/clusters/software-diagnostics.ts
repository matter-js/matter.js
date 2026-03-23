/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise, Bytes } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { SoftwareDiagnostics as SoftwareDiagnosticsModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the SoftwareDiagnostics cluster.
 */
export namespace SoftwareDiagnostics {
    /**
     * {@link SoftwareDiagnostics} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall be
             * represented by a single entry within the ThreadMetrics attribute.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.1
             */
            readonly threadMetrics?: ThreadMetrics[];

            /**
             * Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective amount
             * may be smaller due to heap fragmentation or other reasons.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.2
             */
            readonly currentHeapFree?: number | bigint;

            /**
             * Indicates the current amount of heap memory, in bytes, that is being used.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.3
             */
            readonly currentHeapUsed?: number | bigint;
        }

        export interface Events {
            /**
             * This Event shall be generated when a software fault occurs on the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
             */
            softwareFault?: SoftwareFaultEvent;
        }
    }

    /**
     * {@link SoftwareDiagnostics} supports these elements if it supports feature "Watermarks".
     */
    export namespace WatermarksComponent {
        export interface Attributes {
            /**
             * Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value shall
             * only be reset upon a Node reboot or upon receiving of the ResetWatermarks command.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.4
             */
            readonly currentHeapHighWatermark: number | bigint;
        }

        export interface Commands {
            /**
             * This command is used to reset the high watermarks for heap and stack memory.
             *
             * Receipt of this command shall reset the following values which track high and lower watermarks:
             *
             *   - The StackFreeMinimum field of the ThreadMetrics attribute
             *
             *   - The CurrentHeapHighWatermark attribute
             *
             * ### Effect on Receipt
             *
             * On receipt of this command, the Node shall make the following modifications to attributes it supports:
             *
             * If implemented, the server shall set the value of the CurrentHeapHighWatermark attribute to the value of
             * the CurrentHeapUsed attribute.
             *
             * If implemented, the server shall set the value of the StackFreeMinimum field for every thread to the
             * value of the corresponding thread’s StackFreeCurrent field.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.7.1
             */
            resetWatermarks(): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link SoftwareDiagnostics}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall be
         * represented by a single entry within the ThreadMetrics attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.1
         */
        readonly threadMetrics: ThreadMetrics[];

        /**
         * Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective amount may
         * be smaller due to heap fragmentation or other reasons.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.2
         */
        readonly currentHeapFree: number | bigint;

        /**
         * Indicates the current amount of heap memory, in bytes, that is being used.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.3
         */
        readonly currentHeapUsed: number | bigint;

        /**
         * Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value shall only
         * be reset upon a Node reboot or upon receiving of the ResetWatermarks command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.4
         */
        readonly currentHeapHighWatermark: number | bigint;
    }

    export interface Commands extends WatermarksComponent.Commands {}

    /**
     * Events that may appear in {@link SoftwareDiagnostics}.
     *
     * Devices may not support all of these events. Device support for events may also be affected by a device's
     * supported {@link Features}.
     */
    export interface Events {
        /**
         * This Event shall be generated when a software fault occurs on the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
         */
        softwareFault: SoftwareFaultEvent;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        {
            flags: { watermarks: true },
            attributes: WatermarksComponent.Attributes,
            commands: WatermarksComponent.Commands
        }
    ];

    export type Features = "Watermarks";

    /**
     * These are optional features supported by SoftwareDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.13.4
     */
    export enum Feature {
        /**
         * Watermarks (WTRMRK)
         *
         * Node makes available the metrics for high watermark related to memory consumption.
         */
        Watermarks = "Watermarks"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.13.5.1
     */
    export interface ThreadMetrics {
        /**
         * The Id field shall be a server-assigned per-thread unique ID that is constant for the duration of the thread.
         * Efforts SHOULD be made to avoid reusing ID values when possible.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.1
         */
        id: number | bigint;

        /**
         * The Name field shall be set to a vendor defined name or prefix of the software thread that is static for the
         * duration of the thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.2
         */
        name?: string;

        /**
         * The StackFreeCurrent field shall indicate the current amount of stack memory, in bytes, that are not being
         * utilized on the respective thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.3
         */
        stackFreeCurrent?: number;

        /**
         * The StackFreeMinimum field shall indicate the minimum amount of stack memory, in bytes, that has been
         * available at any point between the current time and this attribute being reset or initialized on the
         * respective thread. This value shall only be reset upon a Node reboot or upon receiving of the ResetWatermarks
         * command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.4
         */
        stackFreeMinimum?: number;

        /**
         * The StackSize field shall indicate the amount of stack memory, in bytes, that has been allocated for use by
         * the respective thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.5
         */
        stackSize?: number;
    }

    /**
     * This Event shall be generated when a software fault occurs on the Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
     */
    export interface SoftwareFaultEvent {
        /**
         * This field shall be set to the ID of the software thread in which the last software fault occurred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.1
         */
        id: number | bigint;

        /**
         * This field shall be set to a manufacturer-specified name or prefix of the software thread in which the last
         * software fault occurred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.2
         */
        name?: string;

        /**
         * This field shall be a manufacturer-specified payload intended to convey information to assist in further
         * diagnosing or debugging a software fault. The FaultRecording field may be used to convey information such as,
         * but not limited to, thread backtraces or register contents.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.3
         */
        faultRecording?: Bytes;
    }

    export const id = ClusterId(0x34);
    export const name = "SoftwareDiagnostics" as const;
    export const revision = 1;
    export const schema = SoftwareDiagnosticsModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof SoftwareDiagnostics;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `SoftwareDiagnostics` instead of
     * `SoftwareDiagnostics.Complete`)
     */
    export type Complete = typeof SoftwareDiagnostics;

    export declare const Complete: Complete;
    export declare const Typing: SoftwareDiagnostics;
}

ClusterNamespace.define(SoftwareDiagnostics);
export type SoftwareDiagnosticsCluster = SoftwareDiagnostics.Cluster;
export const SoftwareDiagnosticsCluster = SoftwareDiagnostics.Cluster;
export interface SoftwareDiagnostics extends ClusterTyping { Attributes: SoftwareDiagnostics.Attributes; Commands: SoftwareDiagnostics.Commands; Events: SoftwareDiagnostics.Events; Features: SoftwareDiagnostics.Features; Components: SoftwareDiagnostics.Components }
