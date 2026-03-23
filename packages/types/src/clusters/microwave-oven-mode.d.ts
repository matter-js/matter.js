/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { VendorId } from "../datatype/VendorId.js";
import type { ModeBase } from "./mode-base.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { MicrowaveOvenMode as MicrowaveOvenModeModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the MicrowaveOvenMode cluster.
 */
export declare namespace MicrowaveOvenMode {
    /**
     * {@link MicrowaveOvenMode} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Exactly one entry in the SupportedModes attribute shall include the Normal mode tag in the ModeTags
             * field.
             *
             * The Normal and Defrost mode tags are mutually exclusive and shall NOT both be used together in a mode’s
             * ModeTags.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.12.5.1
             */
            readonly supportedModes: ModeOption[];

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 8.12.5
             */
            readonly currentMode: number;
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];
    export type Features = "OnOff";

    /**
     * These are optional features supported by MicrowaveOvenModeCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.12.4
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
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2
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
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1
         */
        Day = 9,

        /**
         * This is the normal mode of operation for general cooking of food.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1.1
         */
        Normal = 16384,

        /**
         * This is a mode optimized for defrosting food.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.12.7.1.2
         */
        Defrost = 16385
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
    export const name: "MicrowaveOvenMode";
    export const revision: 2;
    export const schema: typeof MicrowaveOvenModeModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof MicrowaveOvenMode;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `MicrowaveOvenMode` instead of `MicrowaveOvenMode.Complete`)
     */
    export const Complete: typeof MicrowaveOvenMode;

    export const Typing: MicrowaveOvenMode;
}

export declare const MicrowaveOvenModeCluster: typeof MicrowaveOvenMode;
export interface MicrowaveOvenMode extends ClusterTyping { Attributes: MicrowaveOvenMode.Attributes; Features: MicrowaveOvenMode.Features; Components: MicrowaveOvenMode.Components }
