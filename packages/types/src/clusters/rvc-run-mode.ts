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

export namespace RvcRunMode {
    /**
     * These are optional features supported by RvcRunModeCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.2.4
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
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2
         */
        Day = 9,

        /**
         * The device is not performing any of the main operations of the other modes. However, auxiliary actions, such
         * as seeking the charger or charging, may occur.
         *
         * For example, the device has completed cleaning, successfully or not, on its own or due to a command, or has
         * not been asked to clean after a restart.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2.1
         */
        Idle = 16384,

        /**
         * The device was asked to clean so it may be actively running, or paused due to an error, due to a pause
         * command, or for recharging etc. If currently paused and the device can resume it will continue to clean.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2.2
         */
        Cleaning = 16385,

        /**
         * The device was asked to create a map of the space it is located in, so it may be actively running, or paused
         * due to an error, due to a pause command, or for recharging etc. If currently paused and the device can
         * resume, it will continue to map.
         *
         * > [!NOTE]
         *
         * > this mode is intended to be used so the current space can be mapped by the device if the robot has not
         *   previously done that, or if the layout has substantially changed, for an optimal subsequent cleaning
         *   experience.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.2.3
         */
        Mapping = 16386
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
     * @see {@link MatterSpecification.v142.Cluster} § 7.2.5.1
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
     * @see {@link MatterSpecification.v142.Cluster} § 7.2.5.1
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    export enum ModeChangeStatus {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        Stuck = 65,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        DustBinMissing = 66,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        DustBinFull = 67,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        WaterTankEmpty = 68,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        WaterTankMissing = 69,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        WaterTankLidOpen = 70,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        MopCleaningPadMissing = 71,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.2.7.1
         */
        BatteryLow = 72
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
     * These elements and properties are present in all RvcRunMode clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x54,
        name: "RvcRunMode",
        revision: 3,

        features: {
            /**
             * Dependency with the OnOff cluster
             */
            onOff: BitFlag(0)
        },

        attributes: {
            /**
             * At least one entry in the SupportedModes attribute shall include the Idle mode tag in the ModeTags field.
             *
             * At least one entry in the SupportedModes attribute (different from the one above) shall include the
             * Cleaning mode tag in the ModeTags field.
             *
             * The Mapping, Cleaning, and Idle mode tags are mutually exclusive and shall NOT be used together in a
             * mode’s ModeTags.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 7.2.6.1
             */
            supportedModes: FixedAttribute(
                0x0,
                TlvArray(TlvModeOption, { minLength: 2, maxLength: 255 }),
                { default: [] }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 7.2.6
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
         * This metadata controls which RvcRunModeCluster elements matter.js activates for specific feature
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
     * values for the running modes of robotic vacuum cleaner devices.
     *
     * RvcRunModeCluster supports optional features that you can enable with the RvcRunModeCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 7.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type RvcRunModeCluster = RvcRunMode.Cluster;
export const RvcRunModeCluster = RvcRunMode.Cluster;
ClusterRegistry.register(RvcRunMode.Complete);
