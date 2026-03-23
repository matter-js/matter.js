/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { Label as LabelModel } from "@matter/model";

/**
 * Definitions for the Label cluster.
 */
export namespace Label {
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

    /**
     * This is a string tuple with strings that are user defined.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.7.4.1
     */
    export const TlvLabelStruct = TlvObject({
        /**
         * The Label or Value semantic is not defined here.
         *
         * Label examples: "room", "zone", "group", "direction".
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.4.1.1
         */
        label: TlvField(0, TlvString.bound({ maxLength: 16 })),

        /**
         * The Label or Value semantic is not defined here. The Value is a discriminator for a Label that may have
         * multiple instances.
         *
         * Label:Value examples: "room":"bedroom 2", "orientation":"North", "floor":"2", "direction":"up"
         *
         * @see {@link MatterSpecification.v142.Core} § 9.7.4.1.2
         */
        value: TlvField(1, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * Label is a derived cluster, not to be used directly. These elements are present in all clusters derived from
     * Label.
     */
    export const Base = MutableCluster.Component({
        name: "Label",
        revision: 1,

        attributes: {
            /**
             * This is a list of string tuples. Each entry is a LabelStruct.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.7.5.1
             */
            labelList: WritableAttribute(0x0, TlvArray(TlvLabelStruct), { default: [] })
        }
    });

    export const Complete = Base;
    export const name = "Label" as const;
    export const revision = 1;
    export const schema = LabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: Label;
}

ClusterNamespace.define(Label);
export interface Label extends ClusterTyping { Attributes: Label.Attributes; Components: Label.Components }
