/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Label } from "./label.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { FixedLabel as FixedLabelModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FixedLabel cluster.
 */
export namespace FixedLabel {
    /**
     * {@link FixedLabel} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * @see {@link MatterSpecification.v142.Core} § 9.8.4
             */
            readonly labelList: Label.LabelStruct[];
        }
    }

    /**
     * Attributes that may appear in {@link FixedLabel}.
     */
    export interface Attributes {
        /**
         * @see {@link MatterSpecification.v142.Core} § 9.8.4
         */
        readonly labelList: Label.LabelStruct[];
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id = ClusterId(0x40);
    export const name = "FixedLabel" as const;
    export const revision = 1;
    export const schema = FixedLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof FixedLabel;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FixedLabel` instead of `FixedLabel.Complete`)
     */
    export type Complete = typeof FixedLabel;

    export declare const Complete: Complete;
    export declare const Typing: FixedLabel;
}

ClusterNamespace.define(FixedLabel);
export type FixedLabelCluster = FixedLabel.Cluster;
export const FixedLabelCluster = FixedLabel.Cluster;
export interface FixedLabel extends ClusterTyping { Attributes: FixedLabel.Attributes; Components: FixedLabel.Components }
