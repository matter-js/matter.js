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
import type { ModeBase } from "./mode-base.js";
import type { VendorId } from "../datatype/VendorId.js";

/**
 * Definitions for the RefrigeratorAndTemperatureControlledCabinetMode cluster.
 *
 * This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced enumerated values
 * for refrigerator and temperature controlled cabinet devices.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 8.7
 */
export declare namespace RefrigeratorAndTemperatureControlledCabinetMode {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0052;

    /**
     * Textual cluster identifier.
     */
    export const name: "RefrigeratorAndTemperatureControlledCabinetMode";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the RefrigeratorAndTemperatureControlledCabinetMode cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link RefrigeratorAndTemperatureControlledCabinetMode} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * At least one entry in the SupportedModes attribute shall include the Auto mode tag in the ModeTags field
         * list.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.6.1
         */
        supportedModes: ModeOption[];

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.6
         */
        currentMode: number;
    }

    /**
     * Attributes that may appear in {@link RefrigeratorAndTemperatureControlledCabinetMode}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * At least one entry in the SupportedModes attribute shall include the Auto mode tag in the ModeTags field
         * list.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.6.1
         */
        supportedModes: ModeOption[];

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.6
         */
        currentMode: number;
    }

    /**
     * {@link RefrigeratorAndTemperatureControlledCabinetMode} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to change device modes.
         *
         * On receipt of this command the device shall respond with a ChangeToModeResponse command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.7.1
         */
        changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse>;
    }

    /**
     * Commands that may appear in {@link RefrigeratorAndTemperatureControlledCabinetMode}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
    export type Features = "OnOff";

    /**
     * These are optional features supported by RefrigeratorAndTemperatureControlledCabinetModeCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 8.7.4
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
     * @see {@link MatterSpecification.v151.Cluster} § 8.7.5.1
     */
    export declare class ModeOption {
        constructor(values?: Partial<ModeOption>);

        /**
         * This field shall indicate readable text that describes the mode option, so that a client can provide it to
         * the user to indicate what this option means. This field is meant to be readable and understandable by the
         * user.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.2.1
         */
        label: string;

        /**
         * This field is used to identify the mode option.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.2.2
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
         *     audible sound, less likely to disturb the household's activities.
         *
         *   - A mode that includes a LowEnergy tag (standard, defined in this cluster specification) and also a
         *     Delicate tag (standard, defined in the namespace of a Laundry Mode derived cluster).
         *
         *   - A mode that includes both a generic Quick tag (defined here), and Vacuum and Mop tags, (defined in the
         *     RVC Clean cluster that is a derivation of this cluster).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.2.3
         */
        modeTags: ModeTagStruct[];
    };

    export enum ModeTag {
        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1
         */
        Day = 9,

        /**
         * This mode reduces the temperature rapidly, typically above freezing grade.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1.1
         */
        RapidCool = 16384,

        /**
         * This mode reduces the temperature rapidly, below freezing grade.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.7.7.1.2
         */
        RapidFreeze = 16385
    }

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.1
     */
    export declare class ModeTagStruct {
        constructor(values?: Partial<ModeTagStruct>);

        /**
         * If the MfgCode field exists, the Value field shall be in the manufacturer-specific value range (see Section
         * 1.10.8, "Mode Namespace").
         *
         * This field shall indicate the manufacturer's VendorID and it shall determine the meaning of the Value field.
         *
         * The same manufacturer code and mode tag value in separate cluster instances are part of the same namespace
         * and have the same meaning. For example: a manufacturer tag meaning "pinch" can be used both in a cluster
         * whose purpose is to choose the amount of sugar, or in a cluster whose purpose is to choose the amount of
         * salt.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.1.1
         */
        mfgCode?: VendorId;

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.5.1.2
         */
        value: ModeTag | ModeBase.ModeTag;
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
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link RefrigeratorAndTemperatureControlledCabinetMode}.
     */
    export const Cluster: ClusterType.WithCompat<typeof RefrigeratorAndTemperatureControlledCabinetMode, RefrigeratorAndTemperatureControlledCabinetMode>;

    /**
     * @deprecated Use {@link RefrigeratorAndTemperatureControlledCabinetMode}.
     */
    export const Complete: typeof RefrigeratorAndTemperatureControlledCabinetMode;

    export const Typing: RefrigeratorAndTemperatureControlledCabinetMode;
}

/**
 * @deprecated Use {@link RefrigeratorAndTemperatureControlledCabinetMode}.
 */
export declare const RefrigeratorAndTemperatureControlledCabinetModeCluster: typeof RefrigeratorAndTemperatureControlledCabinetMode;

export interface RefrigeratorAndTemperatureControlledCabinetMode extends ClusterTyping {
    Attributes: RefrigeratorAndTemperatureControlledCabinetMode.Attributes;
    Commands: RefrigeratorAndTemperatureControlledCabinetMode.Commands;
    Features: RefrigeratorAndTemperatureControlledCabinetMode.Features;
    Components: RefrigeratorAndTemperatureControlledCabinetMode.Components;
}
