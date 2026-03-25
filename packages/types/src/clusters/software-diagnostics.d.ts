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
 * Definitions for the SoftwareDiagnostics cluster.
 *
 * The Software Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be used by a
 * Node to assist a user or Administrator in diagnosing potential problems. The Software Diagnostics Cluster attempts to
 * centralize all metrics that are relevant to the software that may be running on a Node.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.13
 */
export declare namespace SoftwareDiagnostics {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0034;

    /**
     * Textual cluster identifier.
     */
    export const name: "SoftwareDiagnostics";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the SoftwareDiagnostics cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link SoftwareDiagnostics} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall be
         * represented by a single entry within the ThreadMetrics attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.1
         */
        threadMetrics?: ThreadMetrics[];

        /**
         * Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective amount may
         * be smaller due to heap fragmentation or other reasons.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.2
         */
        currentHeapFree?: number | bigint;

        /**
         * Indicates the current amount of heap memory, in bytes, that is being used.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.3
         */
        currentHeapUsed?: number | bigint;
    }

    /**
     * {@link SoftwareDiagnostics} supports these elements if it supports feature "Watermarks".
     */
    export interface WatermarksAttributes {
        /**
         * Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value shall only
         * be reset upon a Node reboot or upon receiving of the ResetWatermarks command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.4
         */
        currentHeapHighWatermark: number | bigint;
    }

    /**
     * Attributes that may appear in {@link SoftwareDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall be
         * represented by a single entry within the ThreadMetrics attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.1
         */
        threadMetrics: ThreadMetrics[];

        /**
         * Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective amount may
         * be smaller due to heap fragmentation or other reasons.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.2
         */
        currentHeapFree: number | bigint;

        /**
         * Indicates the current amount of heap memory, in bytes, that is being used.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.3
         */
        currentHeapUsed: number | bigint;

        /**
         * Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value shall only
         * be reset upon a Node reboot or upon receiving of the ResetWatermarks command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.6.4
         */
        currentHeapHighWatermark: number | bigint;
    }

    /**
     * {@link SoftwareDiagnostics} supports these elements if it supports feature "Watermarks".
     */
    export interface WatermarksCommands {
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
         * If implemented, the server shall set the value of the CurrentHeapHighWatermark attribute to the value of the
         * CurrentHeapUsed attribute.
         *
         * If implemented, the server shall set the value of the StackFreeMinimum field for every thread to the value of
         * the corresponding thread’s StackFreeCurrent field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.7.1
         */
        resetWatermarks(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link SoftwareDiagnostics}.
     */
    export interface Commands extends WatermarksCommands {}

    /**
     * {@link SoftwareDiagnostics} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This Event shall be generated when a software fault occurs on the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
         */
        softwareFault?: SoftwareFaultEvent;
    }

    /**
     * Events that may appear in {@link SoftwareDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
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
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { watermarks: true }, attributes: WatermarksAttributes, commands: WatermarksCommands }
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
     * @deprecated Use {@link SoftwareDiagnostics}.
     */
    export const Cluster: typeof SoftwareDiagnostics;

    /**
     * @deprecated Use {@link SoftwareDiagnostics}.
     */
    export const Complete: typeof SoftwareDiagnostics;

    export const Typing: SoftwareDiagnostics;
}

/**
 * @deprecated Use {@link SoftwareDiagnostics}.
 */
export declare const SoftwareDiagnosticsCluster: typeof SoftwareDiagnostics;

export interface SoftwareDiagnostics extends ClusterTyping {
    Attributes: SoftwareDiagnostics.Attributes;
    Commands: SoftwareDiagnostics.Commands;
    Events: SoftwareDiagnostics.Events;
    Features: SoftwareDiagnostics.Features;
    Components: SoftwareDiagnostics.Components;
}
