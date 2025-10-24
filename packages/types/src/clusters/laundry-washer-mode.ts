/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FixedAttribute, Attribute, Command } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { ModeBase } from "./mode-base.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace LaundryWasherMode {
    /**
     * These are optional features supported by LaundryWasherModeCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.5.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * Dependency with the OnOff cluster
         */
        OnOff = "OnOff"
    }

    export enum ModeTag {
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1
         */
        Day = 9,

        /**
         * The normal regime of operation.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1.1
         */
        Normal = 16384,

        /**
         * Mode optimized for washing delicate garments.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1.2
         */
        Delicate = 16385,

        /**
         * Mode optimized for heavy washing.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1.3
         */
        Heavy = 16386,

        /**
         * Mode optimized for stain removal on white fabrics.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.5.7.1.4
         */
        Whites = 16387
    }

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1
     */
    export const TlvModeTagStruct = TlvObject({
        /**
         * If the MfgCode field exists, the Value field shall be in the manufacturer-specific value range (see Section
         * 1.10.8, “Mode Namespace”).
         *
         * This field shall indicate the manufacturer’s VendorID and it shall determine the meaning of the Value field.
         *
         * The same manufacturer code and mode tag value in separate cluster instances are part of the same namespace
         * and have the same meaning. For example: a manufacturer tag meaning "pinch" can be used both in a cluster
         * whose purpose is to choose the amount of sugar, or in a cluster whose purpose is to choose the amount of
         * salt.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1.1
         */
        mfgCode: TlvOptionalField(0, TlvVendorId),

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1.2
         */
        value: TlvField(1, TlvEnum<ModeTag | ModeBase.ModeTag>())
    });

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1
     */
    export interface ModeTagStruct extends TypeFromSchema<typeof TlvModeTagStruct> {}

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOption Struct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.5.5.1
     */
    export const TlvModeOption = TlvObject({
        label: TlvField(0, TlvString.bound({ maxLength: 64 })),
        mode: TlvField(1, TlvUInt8),
        modeTags: TlvField(2, TlvArray(TlvModeTagStruct, { minLength: 1, maxLength: 8 }))
    });

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOption Struct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.5.5.1
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    /**
     * These elements and properties are present in all LaundryWasherMode clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x51,
        name: "LaundryWasherMode",
        revision: 3,

        features: {
            /**
             * Dependency with the OnOff cluster
             */
            onOff: BitFlag(0)
        },

        attributes: {
            /**
             * At least one entry in the SupportedModes attribute shall include the Normal mode tag in the ModeTags
             * field list.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.5.6.1
             */
            supportedModes: FixedAttribute(
                0x0,
                TlvArray(TlvModeOption, { minLength: 2, maxLength: 255 }),
                { default: [] }
            ),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 8.5.6
             */
            currentMode: Attribute(0x1, TlvUInt8, { persistent: true })
        },

        commands: {
            /**
             * This command is used to change device modes.
             *
             * On receipt of this command the device shall respond with a ChangeToModeResponse command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.1
             */
            changeToMode: Command(0x0, ModeBase.TlvChangeToModeRequest, 0x1, ModeBase.TlvChangeToModeResponse)
        },

        /**
         * This metadata controls which LaundryWasherModeCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { onOff: true }, component: false })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced enumerated
     * values for laundry washer as well as laundry dryer devices.
     *
     * LaundryWasherModeCluster supports optional features that you can enable with the LaundryWasherModeCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type LaundryWasherModeCluster = LaundryWasherMode.Cluster;
export const LaundryWasherModeCluster = LaundryWasherMode.Cluster;
ClusterRegistry.register(LaundryWasherMode.Complete);
