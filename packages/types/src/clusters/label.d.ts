/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the Label cluster.
 *
 * This cluster provides a feature to tag an endpoint with zero or more labels. This is a base cluster that requires a
 * derived cluster to create an instance.
 *
 * @see {@link MatterSpecification.v142.Core} § 9.7
 */
export declare namespace Label {
    /**
     * Textual cluster identifier.
     */
    export const name: "Label";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the Label cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Label} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This is a list of string tuples. Each entry is a LabelStruct.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.5.1
         */
        labelList: LabelStruct[];
    }

    /**
     * Attributes that may appear in {@link Label}.
     */
    export interface Attributes {
        /**
         * This is a list of string tuples. Each entry is a LabelStruct.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.5.1
         */
        labelList: LabelStruct[];
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * This is a string tuple with strings that are user defined.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.7.4.1
     */
    export interface LabelStruct {
        /**
         * The Label or Value semantic is not defined here.
         *
         * Label examples: "room", "zone", "group", "direction".
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.4.1.1
         */
        label: string;

        /**
         * The Label or Value semantic is not defined here. The Value is a discriminator for a Label that may have
         * multiple instances.
         *
         * Label:Value examples: "room":"bedroom 2", "orientation":"North", "floor":"2", "direction":"up"
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.4.1.2
         */
        value: string;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link Label}.
     */
    export const Complete: typeof Label;

    export const Typing: Label;
}

export interface Label extends ClusterTyping {
    Attributes: Label.Attributes;
    Components: Label.Components;
}
