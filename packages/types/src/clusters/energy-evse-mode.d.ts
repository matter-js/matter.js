/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { ModeBase } from "./mode-base.js";
import type { VendorId } from "../datatype/VendorId.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { EnergyEvseMode as EnergyEvseModeModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the EnergyEvseMode cluster.
 */
export declare namespace EnergyEvseMode {
    /**
     * {@link EnergyEvseMode} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
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
            readonly supportedModes: ModeOption[];

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.4.6
             */
            readonly currentMode: number;
        }

        export interface Commands {
            /**
             * This command is used to change device modes.
             *
             * On receipt of this command the device shall respond with a ChangeToModeResponse command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.1
             */
            changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse>;
        }
    }

    export interface Attributes extends Base.Attributes {}
    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands }];
    export type Features = "OnOff";

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

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOptionStruct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.4.5.1
     */
    export interface ModeOption {
        /**
         * This field shall indicate readable text that describes the mode option, so that a client can provide it to
         * the user to indicate what this option means. This field is meant to be readable and understandable by the
         * user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.1
         */
        label: string;

        /**
         * This field is used to identify the mode option.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.2
         */
        mode: number;

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
         *   - A mode named "100%" can have both the High (manufacturer specific) and Max (standard) mode tag. Clients
         *     seeking the mode for either High or Max will find the same mode in this case.
         *
         *   - A mode that includes a LowEnergy tag can be displayed by the client using a widget icon that shows a
         *     green leaf.
         *
         *   - A mode that includes a LowNoise tag may be used by the client when the user wishes for a lower level of
         *     audible sound, less likely to disturb the household’s activities.
         *
         *   - A mode that includes a LowEnergy tag (standard, defined in this cluster specification) and also a
         *     Delicate tag (standard, defined in the namespace of a Laundry Mode derived cluster).
         *
         *   - A mode that includes both a generic Quick tag (defined here), and Vacuum and Mop tags, (defined in the
         *     RVC Clean cluster that is a derivation of this cluster).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.3
         */
        modeTags: ModeTagStruct[];
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
    export interface ModeTagStruct {
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
        mfgCode?: VendorId;

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1.2
         */
        value: ModeTag | ModeBase.ModeTag;
    }

    export const id: ClusterId;
    export const name: "EnergyEvseMode";
    export const revision: 2;
    export const schema: typeof EnergyEvseModeModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof EnergyEvseMode;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `EnergyEvseMode` instead of `EnergyEvseMode.Complete`)
     */
    export const Complete: typeof EnergyEvseMode;

    export const Typing: EnergyEvseMode;
}

export declare const EnergyEvseModeCluster: typeof EnergyEvseMode;
export interface EnergyEvseMode extends ClusterTyping { Attributes: EnergyEvseMode.Attributes; Commands: EnergyEvseMode.Commands; Features: EnergyEvseMode.Features; Components: EnergyEvseMode.Components }
