/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { Label as LabelModel } from "@matter/model";

/**
 * Definitions for the Label cluster.
 */
export declare namespace Label {
    /**
     * {@link Label} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This is a list of string tuples. Each entry is a LabelStruct.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.7.5.1
             */
            labelList: LabelStruct[];
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

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

    export const name: "Label";
    export const revision: 1;
    export const schema: typeof LabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `Label` instead of `Label.Complete`)
     */
    export const Complete: typeof Label;

    export const Typing: Label;
}

export interface Label extends ClusterTyping { Attributes: Label.Attributes; Components: Label.Components }
