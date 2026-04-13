/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Namespace } from "../globals/Namespace.js";
import type { MaybePromise } from "@matter/general";
import type { VendorId } from "../datatype/VendorId.js";

/**
 * Definitions for the ModeSelect cluster.
 *
 * This cluster provides an interface for controlling a characteristic of a device that can be set to one of several
 * predefined values. For example, the light pattern of a disco ball, the mode of a massage chair, or the wash cycle of
 * a laundry machine.
 *
 * The server allows the client to set a mode on the server. A mode is one of a list of options that may be presented by
 * a client for a user choice, or understood by the client, via the semantic tags on the mode.
 *
 * A semantic tag is either a standard tag within a standard category namespace, or a manufacturer specific tag, within
 * the namespace of the vendor ID of the manufacturer. If there is no semantic tag, the mode is anonymous, and the
 * selection is made by the user solely based on the Label string.
 *
 * Each cluster ID that indicates this specification shall define a distinct purpose for the cluster instance. For
 * example: A LightBlinking cluster ID supports blinking modes for a light (and is described that way).
 *
 * An anonymous mode shall support the derived cluster purpose. A manufacturer specific semantic tag shall support the
 * derived cluster purpose. An anonymous mode shall NOT replace the meaning of a standard semantic tag, when one exists,
 * for the cluster purpose.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.9
 */
export declare namespace ModeSelect {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0050;

    /**
     * Textual cluster identifier.
     */
    export const name: "ModeSelect";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the ModeSelect cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ModeSelect} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute describes the purpose of the server, in readable text.
         *
         * For example, a coffee machine may have a Mode Select cluster for the amount of milk to add, and another Mode
         * Select cluster for the amount of sugar to add. In this case, the first instance can have the description Milk
         * and the second instance can have the description Sugar. This allows the user to tell the purpose of each of
         * the instances.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.1
         */
        description: string;

        /**
         * This attribute, when not null, shall indicate a single standard namespace for any standard semantic tag value
         * supported in this or any other cluster instance with the same value of this attribute. A null value indicates
         * no standard namespace, and therefore, no standard semantic tags are provided in this cluster instance. Each
         * standard namespace and corresponding values and value meanings shall be defined in another document.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.2
         */
        standardNamespace: Namespace | null;

        /**
         * This attribute is the list of supported modes that may be selected for the CurrentMode attribute. Each item
         * in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct. Each entry in
         * this list shall have a unique value for the Mode field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.3
         */
        supportedModes: ModeOption[];

        /**
         * This attribute represents the current mode of the server.
         *
         * The value of this field must match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.4
         */
        currentMode: number;

        /**
         * The StartUpMode attribute value indicates the desired startup mode for the server when it is supplied with
         * power.
         *
         * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
         * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute (see
         * Section 1.9.6.6.1, “OnMode with Power Up”).
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode attribute
         * shall return to its value prior to the restart.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * If this attribute is not implemented, or is set to the null value, it shall have no effect.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.5
         */
        startUpMode?: number | null;
    }

    /**
     * {@link ModeSelect} supports these elements if it supports feature "OnOff".
     */
    export interface OnOffAttributes {
        /**
         * Indicates the value of CurrentMode that depends on the state of the On/Off cluster on the same endpoint. If
         * this attribute is not present or is set to null, it shall NOT have an effect, otherwise the CurrentMode
         * attribute shall depend on the OnOff attribute of the On/Off cluster
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.6
         */
        onMode: number | null;
    }

    /**
     * Attributes that may appear in {@link ModeSelect}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute describes the purpose of the server, in readable text.
         *
         * For example, a coffee machine may have a Mode Select cluster for the amount of milk to add, and another Mode
         * Select cluster for the amount of sugar to add. In this case, the first instance can have the description Milk
         * and the second instance can have the description Sugar. This allows the user to tell the purpose of each of
         * the instances.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.1
         */
        description: string;

        /**
         * This attribute, when not null, shall indicate a single standard namespace for any standard semantic tag value
         * supported in this or any other cluster instance with the same value of this attribute. A null value indicates
         * no standard namespace, and therefore, no standard semantic tags are provided in this cluster instance. Each
         * standard namespace and corresponding values and value meanings shall be defined in another document.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.2
         */
        standardNamespace: Namespace | null;

        /**
         * This attribute is the list of supported modes that may be selected for the CurrentMode attribute. Each item
         * in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct. Each entry in
         * this list shall have a unique value for the Mode field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.3
         */
        supportedModes: ModeOption[];

        /**
         * This attribute represents the current mode of the server.
         *
         * The value of this field must match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.4
         */
        currentMode: number;

        /**
         * The StartUpMode attribute value indicates the desired startup mode for the server when it is supplied with
         * power.
         *
         * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
         * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute (see
         * Section 1.9.6.6.1, “OnMode with Power Up”).
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode attribute
         * shall return to its value prior to the restart.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * If this attribute is not implemented, or is set to the null value, it shall have no effect.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.5
         */
        startUpMode: number | null;

        /**
         * Indicates the value of CurrentMode that depends on the state of the On/Off cluster on the same endpoint. If
         * this attribute is not present or is set to null, it shall NOT have an effect, otherwise the CurrentMode
         * attribute shall depend on the OnOff attribute of the On/Off cluster
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.6
         */
        onMode: number | null;
    }

    /**
     * {@link ModeSelect} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported list,
         * the server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall respond with
         * an INVALID_COMMAND status response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.7.1
         */
        changeToMode(request: ChangeToModeRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ModeSelect}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { onOff: true }, attributes: OnOffAttributes }
    ];
    export type Features = "OnOff";

    /**
     * These are optional features supported by ModeSelectCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
         * endpoint. See Section 1.9.6.6, “OnMode Attribute” for more information.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.4.1
         */
        OnOff = "OnOff"
    }

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.2
     */
    export declare class ModeOption {
        constructor(values?: Partial<ModeOption>);

        /**
         * This field is readable text that describes the mode option that can be used by a client to indicate to the
         * user what this option means. This field is meant to be readable and understandable by the user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.2.1
         */
        label: string;

        /**
         * The Mode field is used to identify the mode option. The value shall be unique for every item in the
         * SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.2.2
         */
        mode: number;

        /**
         * This field is a list of semantic tags that map to the mode option. This may be used by clients to determine
         * the meaning of the mode option as defined in a standard or manufacturer specific namespace. Semantic tags can
         * help clients look for options that meet certain criteria. A semantic tag shall be either a standard tag or
         * manufacturer specific tag as defined in each SemanticTagStruct list entry.
         *
         * A mode option may have more than one semantic tag. A mode option may be mapped to a mixture of standard and
         * manufacturer specific semantic tags.
         *
         * All standard semantic tags are from a single namespace indicated by the StandardNamespace attribute.
         *
         * For example: A mode labeled "100%" can have both the HIGH (MS) and MAX (standard) semantic tag. Clients
         * seeking the option for either HIGH or MAX will find the same option in this case.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.2.3
         */
        semanticTags: SemanticTag[];
    };

    /**
     * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported list, the
     * server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall respond with an
     * INVALID_COMMAND status response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.7.1
     */
    export declare class ChangeToModeRequest {
        constructor(values?: Partial<ChangeToModeRequest>);
        newMode: number;
    };

    /**
     * A Semantic Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.1
     */
    export declare class SemanticTag {
        constructor(values?: Partial<SemanticTag>);

        /**
         * This field shall indicate a manufacturer code (Vendor ID), and the Value field shall indicate a semantic tag
         * defined by the manufacturer. Each manufacturer code supports a single namespace of values. The same
         * manufacturer code and semantic tag value in separate cluster instances are part of the same namespace and
         * have the same meaning. For example: a manufacturer tag meaning "pinch", has the same meaning in a cluster
         * whose purpose is to choose the amount of sugar, or amount of salt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.1.2
         */
        mfgCode: VendorId;

        /**
         * This field shall indicate the semantic tag within a semantic tag namespace which is either manufacturer
         * specific or standard. For semantic tags in a standard namespace, see Standard Namespace.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.1.1
         */
        value: number;
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
     * @deprecated Use {@link ModeSelect}.
     */
    export const Cluster: ClusterType.WithCompat<typeof ModeSelect, ModeSelect>;

    /**
     * @deprecated Use {@link ModeSelect}.
     */
    export const Complete: typeof ModeSelect;

    export const Typing: ModeSelect;
}

/**
 * @deprecated Use {@link ModeSelect}.
 */
export declare const ModeSelectCluster: typeof ModeSelect;

export interface ModeSelect extends ClusterTyping {
    Attributes: ModeSelect.Attributes;
    Commands: ModeSelect.Commands;
    Features: ModeSelect.Features;
    Components: ModeSelect.Components;
}
