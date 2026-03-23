/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Namespace } from "../globals/Namespace.js";
import { MaybePromise } from "@matter/general";
import { VendorId } from "../datatype/VendorId.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ModeSelect as ModeSelectModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ModeSelect cluster.
 */
export namespace ModeSelect {
    /**
     * {@link ModeSelect} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute describes the purpose of the server, in readable text.
             *
             * For example, a coffee machine may have a Mode Select cluster for the amount of milk to add, and another
             * Mode Select cluster for the amount of sugar to add. In this case, the first instance can have the
             * description Milk and the second instance can have the description Sugar. This allows the user to tell the
             * purpose of each of the instances.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.1
             */
            readonly description: string;

            /**
             * This attribute, when not null, shall indicate a single standard namespace for any standard semantic tag
             * value supported in this or any other cluster instance with the same value of this attribute. A null value
             * indicates no standard namespace, and therefore, no standard semantic tags are provided in this cluster
             * instance. Each standard namespace and corresponding values and value meanings shall be defined in another
             * document.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.2
             */
            readonly standardNamespace: Namespace | null;

            /**
             * This attribute is the list of supported modes that may be selected for the CurrentMode attribute. Each
             * item in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct. Each
             * entry in this list shall have a unique value for the Mode field.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.3
             */
            readonly supportedModes: ModeOption[];

            /**
             * This attribute represents the current mode of the server.
             *
             * The value of this field must match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.4
             */
            readonly currentMode: number;

            /**
             * The StartUpMode attribute value indicates the desired startup mode for the server when it is supplied
             * with power.
             *
             * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
             * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute
             * (see Section 1.9.6.6.1, “OnMode with Power Up”).
             *
             * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode
             * attribute shall return to its value prior to the restart.
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * If this attribute is not implemented, or is set to the null value, it shall have no effect.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.5
             */
            startUpMode?: number | null;
        }

        export interface Commands {
            /**
             * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported
             * list, the server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall
             * respond with an INVALID_COMMAND status response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.7.1
             */
            changeToMode(request: ChangeToModeRequest): MaybePromise;
        }
    }

    /**
     * {@link ModeSelect} supports these elements if it supports feature "OnOff".
     */
    export namespace OnOffComponent {
        export interface Attributes {
            /**
             * Indicates the value of CurrentMode that depends on the state of the On/Off cluster on the same endpoint.
             * If this attribute is not present or is set to null, it shall NOT have an effect, otherwise the
             * CurrentMode attribute shall depend on the OnOff attribute of the On/Off cluster
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.6
             */
            onMode: number | null;
        }
    }

    /**
     * Attributes that may appear in {@link ModeSelect}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
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
        readonly description: string;

        /**
         * This attribute, when not null, shall indicate a single standard namespace for any standard semantic tag value
         * supported in this or any other cluster instance with the same value of this attribute. A null value indicates
         * no standard namespace, and therefore, no standard semantic tags are provided in this cluster instance. Each
         * standard namespace and corresponding values and value meanings shall be defined in another document.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.2
         */
        readonly standardNamespace: Namespace | null;

        /**
         * This attribute is the list of supported modes that may be selected for the CurrentMode attribute. Each item
         * in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct. Each entry in
         * this list shall have a unique value for the Mode field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.3
         */
        readonly supportedModes: ModeOption[];

        /**
         * This attribute represents the current mode of the server.
         *
         * The value of this field must match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.6.4
         */
        readonly currentMode: number;

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

    export interface Commands extends Base.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { onOff: true }, attributes: OnOffComponent.Attributes }
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
    export interface ModeOption {
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
    }

    /**
     * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported list, the
     * server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall respond with an
     * INVALID_COMMAND status response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.7.1
     */
    export interface ChangeToModeRequest {
        newMode: number;
    }

    /**
     * A Semantic Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.9.5.1
     */
    export interface SemanticTag {
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
    }

    export const id = ClusterId(0x50);
    export const name = "ModeSelect" as const;
    export const revision = 2;
    export const schema = ModeSelectModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof ModeSelect;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ModeSelect` instead of `ModeSelect.Complete`)
     */
    export type Complete = typeof ModeSelect;

    export declare const Complete: Complete;
    export declare const Typing: ModeSelect;
}

ClusterNamespace.define(ModeSelect);
export type ModeSelectCluster = ModeSelect.Cluster;
export const ModeSelectCluster = ModeSelect.Cluster;
export interface ModeSelect extends ClusterTyping { Attributes: ModeSelect.Attributes; Commands: ModeSelect.Commands; Features: ModeSelect.Features; Components: ModeSelect.Components }
