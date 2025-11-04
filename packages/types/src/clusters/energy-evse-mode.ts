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

export namespace EnergyEvseMode {
    /**
     * These are optional features supported by EnergyEvseModeCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.4.4
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
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1
         */
        Day = 9,

        /**
         * While in modes with this tag, and once enabled with the EnableCharging command, the EVSE will permit charging
         * based on demand from the EV.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1.1
         */
        Manual = 16384,

        /**
         * While in modes with this tag, and once enabled with the EnableCharging command, the EVSE will attempt to
         * automatically start charging based on the user’s charging targets (for example, set based on a Time of Use
         * tariff to charge at the cheapest times of the day).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1.2
         */
        TimeOfUse = 16385,

        /**
         * While in modes with this tag, and once enabled with the EnableCharging, the EVSE will attempt to
         * automatically start charging based on available excess solar PV generation, limiting the charging power to
         * avoid importing energy from the grid.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1.3
         */
        SolarCharging = 16386,

        /**
         * While in modes with this tag, and once enabled with the EnableDischarging command, the EVSE will permit
         * discharging based on the current charge state of the EV, and its control from an associated Device Energy
         * Management cluster.
         *
         * > [!NOTE]
         *
         * > being in a mode with this tag set or not does not affect the handling of the EnableDischarging command by
         *   the Energy EVSE cluster, but once enabled, only modes with this tag enable the discharging to actually
         *   occur.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.4.7.1.4
         */
        V2X = 16387
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
     * @see {@link MatterSpecification.v142.Cluster} § 9.4.5.1
     */
    export const TlvModeOption = TlvObject({
        /**
         * This field shall indicate readable text that describes the mode option, so that a client can provide it to
         * the user to indicate what this option means. This field is meant to be readable and understandable by the
         * user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.1
         */
        label: TlvField(0, TlvString.bound({ maxLength: 64 })),

        /**
         * This field is used to identify the mode option.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.2
         */
        mode: TlvField(1, TlvUInt8),

        /**
         * This field shall contain a list of tags that are associated with the mode option. This may be used by clients
         * to determine the full or the partial semantics of a certain mode, depending on which tags they understand,
         * using standard definitions and/or manufacturer specific namespace definitions.
         *
         * The standard mode tags are defined in this cluster specification. For the derived cluster instances, if the
         * specification of the derived cluster defines a namespace, the set of standard mode tags also includes the
         * mode tag values from that namespace.
         *
         * Mode tags can help clients look for options that meet certain criteria, render the user interface, use the
         * mode in an automation, or to craft help text their voice-driven interfaces. A mode tag shall be either a
         * standard tag or a manufacturer specific tag, as defined in each ModeTagStruct list entry.
         *
         * A mode option may have more than one mode tag. A mode option may be associated with a mixture of standard and
         * manufacturer specific mode tags. A mode option shall be associated with at least one standard mode tag.
         *
         * Each mode tag in this field shall be distinct from other mode tags in this field. For example, a simplified
         * list containing [Auto, Auto] would not be allowed.
         *
         * A few examples are provided below.
         *
         *   • A mode named "100%" can have both the High (manufacturer specific) and Max (standard) mode tag. Clients
         *     seeking the mode for either High or Max will find the same mode in this case.
         *
         *   • A mode that includes a LowEnergy tag can be displayed by the client using a widget icon that shows a
         *     green leaf.
         *
         *   • A mode that includes a LowNoise tag may be used by the client when the user wishes for a lower level of
         *     audible sound, less likely to disturb the household’s activities.
         *
         *   • A mode that includes a LowEnergy tag (standard, defined in this cluster specification) and also a
         *     Delicate tag (standard, defined in the namespace of a Laundry Mode derived cluster).
         *
         *   • A mode that includes both a generic Quick tag (defined here), and Vacuum and Mop tags, (defined in the
         *     RVC Clean cluster that is a derivation of this cluster).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.3
         */
        modeTags: TlvField(2, TlvArray(TlvModeTagStruct, { maxLength: 8 }))
    });

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOptionStruct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.4.5.1
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    /**
     * These elements and properties are present in all EnergyEvseMode clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x9d,
        name: "EnergyEvseMode",
        revision: 2,

        features: {
            /**
             * Dependency with the OnOff cluster
             */
            onOff: BitFlag(0)
        },

        attributes: {
            /**
             * At least one entry in the SupportedModes attribute shall include the Manual mode tag in the ModeTags
             * field list.
             *
             * Modes with entries in the SupportedModes attribute which contain multiple mode tags permitting charging
             * or discharging under different conditions shall permit the charging or discharging to occur if any of the
             * conditions are satisfied.
             *
             * Modes shall NOT have both the Manual tag and the TimeOfUse or SolarCharging tags defined in the
             * SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.4.6.1
             */
            supportedModes: FixedAttribute(
                0x0,
                TlvArray(TlvModeOption, { minLength: 2, maxLength: 255 }),
                { default: [] }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.4.6
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
            changeToMode: Command(0x0, ModeBase.TlvChangeToModeRequest, 0x1, ModeBase.TlvChangeToModeResponse)
        },

        /**
         * This metadata controls which EnergyEvseModeCluster elements matter.js activates for specific feature
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
     * values for EVSE devices.
     *
     * EnergyEvseModeCluster supports optional features that you can enable with the EnergyEvseModeCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type EnergyEvseModeCluster = EnergyEvseMode.Cluster;
export const EnergyEvseModeCluster = EnergyEvseMode.Cluster;
ClusterRegistry.register(EnergyEvseMode.Complete);
