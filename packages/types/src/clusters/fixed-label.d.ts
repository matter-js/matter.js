/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { Label } from "./label.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { FixedLabel as FixedLabelModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FixedLabel cluster.
 */
export declare namespace FixedLabel {
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

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "FixedLabel";
    export const revision: 1;
    export const schema: typeof FixedLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof FixedLabel;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FixedLabel` instead of `FixedLabel.Complete`)
     */
    export const Complete: typeof FixedLabel;

    export const Typing: FixedLabel;
}

export declare const FixedLabelCluster: typeof FixedLabel;
export interface FixedLabel extends ClusterTyping { Attributes: FixedLabel.Attributes; Components: FixedLabel.Components }
