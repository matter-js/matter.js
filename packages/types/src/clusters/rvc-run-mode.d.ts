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
 * Definitions for the RvcRunMode cluster.
 *
 * This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced enumerated values
 * for the running modes of robotic vacuum cleaner devices.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 7.2
 */
export declare namespace RvcRunMode {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0054;

    /**
     * Textual cluster identifier.
     */
    export const name: "RvcRunMode";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the RvcRunMode cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link RvcRunMode} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * At least one entry in the SupportedModes attribute shall include the Idle mode tag in the ModeTags field.
         *
         * At least one entry in the SupportedModes attribute (different from the one above) shall include the Cleaning
         * mode tag in the ModeTags field.
         *
         * The Mapping, Cleaning, and Idle mode tags are mutually exclusive and shall NOT be used together in a mode’s
         * ModeTags.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.6.1
         */
        supportedModes: ModeOption[];

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.6
         */
        currentMode: number;
    }

    /**
     * Attributes that may appear in {@link RvcRunMode}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * At least one entry in the SupportedModes attribute shall include the Idle mode tag in the ModeTags field.
         *
         * At least one entry in the SupportedModes attribute (different from the one above) shall include the Cleaning
         * mode tag in the ModeTags field.
         *
         * The Mapping, Cleaning, and Idle mode tags are mutually exclusive and shall NOT be used together in a mode’s
         * ModeTags.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.6.1
         */
        supportedModes: ModeOption[];

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.6
         */
        currentMode: number;
    }

    /**
     * {@link RvcRunMode} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to change device modes.
         *
         * On receipt of this command the device shall respond with a ChangeToModeResponse command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.7.1
         */
        changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ChangeToModeResponse>;
    }

    /**
     * Commands that may appear in {@link RvcRunMode}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
    export type Features = "OnOff" | "DirectModeChange";

    /**
     * These are optional features supported by RvcRunModeCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 7.2.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * Dependency with the OnOff cluster
         */
        OnOff = "OnOff",

        /**
         * DirectModeChange (DIRECTMODECH)
         *
         * This feature indicates whether the cluster implementation supports changing the run modes while the RVC Run
         * Mode cluster’s CurrentMode attribute is set to a mode without the Idle mode tag. If the implementation does
         * not support such a change, the ChangeToModeResponse command shall have the StatusCode field set to the
         * InvalidInMode value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.4.1
         */
        DirectModeChange = "DirectModeChange"
    }

    /**
     * The table below lists the changes relative to the Mode Base cluster for the fields of the ModeOptionStruct type.
     * A blank field indicates no change.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 7.2.5.1
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
         *     audible sound, less likely to disturb the household’s activities.
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

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.10.7.2
     */
    export declare class ChangeToModeResponse {
        constructor(values?: Partial<ChangeToModeResponse>);

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 1.10.7.2.1
         */
        status: ModeChangeStatus | ModeBase.ModeChangeStatus;

        statusText: string;
    };

    export enum ModeChangeStatus {
        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        Stuck = 65,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        DustBinMissing = 66,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        DustBinFull = 67,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        WaterTankEmpty = 68,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        WaterTankMissing = 69,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        WaterTankLidOpen = 70,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        MopCleaningPadMissing = 71,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.1
         */
        BatteryLow = 72
    }

    export enum ModeTag {
        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2
         */
        Day = 9,

        /**
         * The device is not performing any of the main operations of the other modes. However, auxiliary actions, such
         * as seeking the charger or charging, may occur.
         *
         * For example, the device has completed cleaning, successfully or not, on its own or due to a command, or has
         * not been asked to clean after a restart.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2.1
         */
        Idle = 16384,

        /**
         * The device was asked to clean so it may be actively running, or paused due to an error, due to a pause
         * command, or for recharging etc. If currently paused and the device can resume it will continue to clean.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2.2
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
         * @see {@link MatterSpecification.v151.Cluster} § 7.2.7.2.3
         */
        Mapping = 16386
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
         * 1.10.8, “Mode Namespace”).
         *
         * This field shall indicate the manufacturer’s VendorID and it shall determine the meaning of the Value field.
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
     * @deprecated Use {@link RvcRunMode}.
     */
    export const Cluster: typeof RvcRunMode;

    /**
     * @deprecated Use {@link RvcRunMode}.
     */
    export const Complete: typeof RvcRunMode;

    export const Typing: RvcRunMode;
}

/**
 * @deprecated Use {@link RvcRunMode}.
 */
export declare const RvcRunModeCluster: typeof RvcRunMode;

export interface RvcRunMode extends ClusterTyping {
    Attributes: RvcRunMode.Attributes;
    Commands: RvcRunMode.Commands;
    Features: RvcRunMode.Features;
    Components: RvcRunMode.Components;
}
