/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, OptionalAttribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvUInt64, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace SoftwareDiagnostics {
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
    export const TlvThreadMetrics = TlvObject({
        /**
         * The Id field shall be a server-assigned per-thread unique ID that is constant for the duration of the thread.
         * Efforts SHOULD be made to avoid reusing ID values when possible.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.1
         */
        id: TlvField(0, TlvUInt64),

        /**
         * The Name field shall be set to a vendor defined name or prefix of the software thread that is static for the
         * duration of the thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.2
         */
        name: TlvOptionalField(1, TlvString.bound({ maxLength: 8 })),

        /**
         * The StackFreeCurrent field shall indicate the current amount of stack memory, in bytes, that are not being
         * utilized on the respective thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.3
         */
        stackFreeCurrent: TlvOptionalField(2, TlvUInt32),

        /**
         * The StackFreeMinimum field shall indicate the minimum amount of stack memory, in bytes, that has been
         * available at any point between the current time and this attribute being reset or initialized on the
         * respective thread. This value shall only be reset upon a Node reboot or upon receiving of the ResetWatermarks
         * command.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.4
         */
        stackFreeMinimum: TlvOptionalField(3, TlvUInt32),

        /**
         * The StackSize field shall indicate the amount of stack memory, in bytes, that has been allocated for use by
         * the respective thread.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.5.1.5
         */
        stackSize: TlvOptionalField(4, TlvUInt32)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.13.5.1
     */
    export interface ThreadMetrics extends TypeFromSchema<typeof TlvThreadMetrics> {}

    /**
     * Body of the SoftwareDiagnostics softwareFault event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
     */
    export const TlvSoftwareFaultEvent = TlvObject({
        /**
         * This field shall be set to the ID of the software thread in which the last software fault occurred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.1
         */
        id: TlvField(0, TlvUInt64),

        /**
         * This field shall be set to a manufacturer-specified name or prefix of the software thread in which the last
         * software fault occurred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.2
         */
        name: TlvOptionalField(1, TlvString.bound({ maxLength: 8 })),

        /**
         * This field shall be a manufacturer-specified payload intended to convey information to assist in further
         * diagnosing or debugging a software fault. The FaultRecording field may be used to convey information such as,
         * but not limited to, thread backtraces or register contents.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.13.8.1.3
         */
        faultRecording: TlvOptionalField(2, TlvByteString.bound({ maxLength: 1024 }))
    });

    /**
     * Body of the SoftwareDiagnostics softwareFault event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
     */
    export interface SoftwareFaultEvent extends TypeFromSchema<typeof TlvSoftwareFaultEvent> {}

    /**
     * A SoftwareDiagnosticsCluster supports these elements if it supports feature Watermarks.
     */
    export const WatermarksComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value shall
             * only be reset upon a Node reboot or upon receiving of the ResetWatermarks command.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.4
             */
            currentHeapHighWatermark: Attribute(0x3, TlvUInt64)
        },

        commands: {
            /**
             * This command is used to reset the high watermarks for heap and stack memory.
             *
             * Receipt of this command shall reset the following values which track high and lower watermarks:
             *
             *   • The StackFreeMinimum field of the ThreadMetrics attribute
             *
             *   • The CurrentHeapHighWatermark attribute
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
            resetWatermarks: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * These elements and properties are present in all SoftwareDiagnostics clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x34,
        name: "SoftwareDiagnostics",
        revision: 1,

        features: {
            /**
             * Node makes available the metrics for high watermark related to memory consumption.
             */
            watermarks: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall be
             * represented by a single entry within the ThreadMetrics attribute.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.1
             */
            threadMetrics: OptionalAttribute(0x0, TlvArray(TlvThreadMetrics, { maxLength: 64 }), { default: [] }),

            /**
             * Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective amount
             * may be smaller due to heap fragmentation or other reasons.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.2
             */
            currentHeapFree: OptionalAttribute(0x1, TlvUInt64),

            /**
             * Indicates the current amount of heap memory, in bytes, that is being used.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.6.3
             */
            currentHeapUsed: OptionalAttribute(0x2, TlvUInt64)
        },

        events: {
            /**
             * This Event shall be generated when a software fault occurs on the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.13.8.1
             */
            softwareFault: OptionalEvent(0x0, Priority.Info, TlvSoftwareFaultEvent)
        },

        /**
         * This metadata controls which SoftwareDiagnosticsCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { watermarks: true }, component: WatermarksComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Software Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be used by
     * a Node to assist a user or Administrator in diagnosing potential problems. The Software Diagnostics Cluster
     * attempts to centralize all metrics that are relevant to the software that may be running on a Node.
     *
     * SoftwareDiagnosticsCluster supports optional features that you can enable with the
     * SoftwareDiagnosticsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.13
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const WTRMRK = { watermarks: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            currentHeapHighWatermark: MutableCluster.AsConditional(
                WatermarksComponent.attributes.currentHeapHighWatermark,
                { mandatoryIf: [WTRMRK] }
            )
        },

        commands: {
            resetWatermarks: MutableCluster.AsConditional(
                WatermarksComponent.commands.resetWatermarks,
                { mandatoryIf: [WTRMRK] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all SoftwareDiagnostics features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type SoftwareDiagnosticsCluster = SoftwareDiagnostics.Cluster;
export const SoftwareDiagnosticsCluster = SoftwareDiagnostics.Cluster;
ClusterRegistry.register(SoftwareDiagnostics.Complete);
