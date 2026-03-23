/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Label } from "./label.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { UserLabel as UserLabelModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the UserLabel cluster.
 */
export namespace UserLabel {
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

    /**
     * Attributes that may appear in {@link UserLabel}.
     */
    export interface Attributes {
        /**
         * An implementation shall support at least 4 list entries per node for all User Label cluster instances on the
         * node.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
         */
        labelList: Label.LabelStruct[];
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id = ClusterId(0x41);
    export const name = "UserLabel" as const;
    export const revision = 1;
    export const schema = UserLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof UserLabel;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `UserLabel` instead of `UserLabel.Complete`)
     */
    export type Complete = typeof UserLabel;

    export declare const Complete: Complete;
    export declare const Typing: UserLabel;
}

ClusterNamespace.define(UserLabel);
export type UserLabelCluster = UserLabel.Cluster;
export const UserLabelCluster = UserLabel.Cluster;
export interface UserLabel extends ClusterTyping { Attributes: UserLabel.Attributes; Components: UserLabel.Components }
