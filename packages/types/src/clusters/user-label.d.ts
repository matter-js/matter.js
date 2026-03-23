/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Label } from "./label.js";

/**
 * Definitions for the UserLabel cluster.
 *
 * This cluster is derived from the Label cluster and provides a feature to tag an endpoint with zero or more writable
 * labels.
 *
 * @see {@link MatterSpecification.v142.Core} § 9.9
 */
export declare namespace UserLabel {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0041;

    /**
     * Textual cluster identifier.
     */
    export const name: "UserLabel";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the UserLabel cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link UserLabel} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * An implementation shall support at least 4 list entries per node for all User Label cluster instances on the
         * node.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
         */
        labelList: Label.LabelStruct[];
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

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link UserLabel}.
     */
    export const Cluster: typeof UserLabel;

    /**
     * @deprecated Use {@link UserLabel}.
     */
    export const Complete: typeof UserLabel;

    export const Typing: UserLabel;
}

/**
 * @deprecated Use {@link UserLabel}.
 */
export declare const UserLabelCluster: typeof UserLabel;

export interface UserLabel extends ClusterTyping {
    Attributes: UserLabel.Attributes;
    Components: UserLabel.Components;
}
