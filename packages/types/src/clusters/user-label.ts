/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { Label } from "./label.js";
import { AccessLevel, UserLabel as UserLabelModel } from "@matter/model";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
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

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x41,
        name: "UserLabel",
        revision: 1,

        attributes: {
            /**
             * An implementation shall support at least 4 list entries per node for all User Label cluster instances on
             * the node.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
             */
            labelList: WritableAttribute(
                0x0,
                TlvArray(Label.TlvLabelStruct, { minLength: 0 }),
                { persistent: true, default: [], writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * This cluster is derived from the Label cluster and provides a feature to tag an endpoint with zero or more
     * writable labels.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x41);
    export const name = "UserLabel" as const;
    export const revision = 1;
    export const schema = UserLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: UserLabel;
}

export type UserLabelCluster = UserLabel.Cluster;
export const UserLabelCluster = UserLabel.Cluster;
ClusterNamespace.define(UserLabel);
export interface UserLabel extends ClusterTyping { Attributes: UserLabel.Attributes; Components: UserLabel.Components }
