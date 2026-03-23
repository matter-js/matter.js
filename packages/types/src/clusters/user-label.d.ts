/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { Label } from "./label.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { UserLabel as UserLabelModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the UserLabel cluster.
 */
export declare namespace UserLabel {
    /**
     * {@link UserLabel} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * An implementation shall support at least 4 list entries per node for all User Label cluster instances on
             * the node.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
             */
            labelList: Label.LabelStruct[];
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "UserLabel";
    export const revision: 1;
    export const schema: typeof UserLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof UserLabel;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `UserLabel` instead of `UserLabel.Complete`)
     */
    export const Complete: typeof UserLabel;

    export const Typing: UserLabel;
}

export declare const UserLabelCluster: typeof UserLabel;
export interface UserLabel extends ClusterTyping { Attributes: UserLabel.Attributes; Components: UserLabel.Components }
