/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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

export namespace RvcCleanMode {
    /**
     * These are optional features supported by RvcCleanModeCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.3.4
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
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        Day = 9,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        DeepClean = 16384,

        /**
         * The device’s vacuuming feature is enabled in this mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2.2
         */
        Vacuum = 16385,

        /**
         * The device’s mopping feature is enabled in this mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2.3
         */
        Mop = 16386,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.2
         */
        VacuumThenMop = 16387
    }

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1
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
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1.1
         */
        mfgCode: TlvOptionalField(0, TlvVendorId),

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1.2
         */
        value: TlvField(1, TlvEnum<ModeTag | ModeBase.ModeTag>())
    });

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1
     */
    export interface ModeTagStruct extends TypeFromSchema<typeof TlvModeTagStruct> {}

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOptionStruct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.3.5.1
     */
    export const TlvModeOption = TlvObject({
        label: TlvField(0, TlvString.bound({ maxLength: 64 })),
        mode: TlvField(1, TlvUInt8),
        modeTags: TlvField(2, TlvArray(TlvModeTagStruct, { minLength: 1, maxLength: 8 }))
    });

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOptionStruct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.3.5.1
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    export enum ModeChangeStatus {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.3.7.1
         */
        CleaningInProgress = 64
    }

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2
     */
    export const TlvChangeToModeResponse = TlvObject({
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1
         */
        status: TlvField(0, TlvEnum<ModeChangeStatus | ModeBase.ModeChangeStatus>()),

        statusText: TlvField(1, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2
     */
    export interface ChangeToModeResponse extends TypeFromSchema<typeof TlvChangeToModeResponse> {}

    /**
     * These elements and properties are present in all RvcCleanMode clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x55,
        name: "RvcCleanMode",
        revision: 4,

        features: {
            /**
             * Dependency with the OnOff cluster
             */
            onOff: BitFlag(0)
        },

        attributes: {
            /**
             * At least one entry in the SupportedModes attribute shall include the Vacuum and/or the Mop mode tag in
             * the ModeTags field list.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 7.3.6.1
             */
            supportedModes: FixedAttribute(
                0x0,
                TlvArray(TlvModeOption, { minLength: 2, maxLength: 255 }),
                { default: [] }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 7.3.6
             */
            currentMode: Attribute(0x1, TlvUInt8, { persistent: true })
        },

        commands: {
            /**
             * This command is used to change device modes.
             *
             * On receipt of this command the device shall respond with a ChangeToModeResponse command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.1
             */
            changeToMode: Command(0x0, ModeBase.TlvChangeToModeRequest, 0x1, TlvChangeToModeResponse)
        },

        /**
         * This metadata controls which RvcCleanModeCluster elements matter.js activates for specific feature
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
     * values for the cleaning type of robotic vacuum cleaner devices.
     *
     * RvcCleanModeCluster supports optional features that you can enable with the RvcCleanModeCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type RvcCleanModeCluster = RvcCleanMode.Cluster;
export const RvcCleanModeCluster = RvcCleanMode.Cluster;
ClusterRegistry.register(RvcCleanMode.Complete);
