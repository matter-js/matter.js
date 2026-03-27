/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
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
         * The server shall support the storage of up to 4 list entries in this attribute. The server may support the
         * storage of more than 4 entries in this attribute.
         *
         * When reading from this attribute, the server shall respond with the actual contents of the attribute which
         * may contain any number of entries (possibly more than 4), When writing to this attribute, a client may
         * include any number of entries to be written, or none at all.
         *
         * If an attempt is made to write to this attribute with a list length that is not supported by the server, the
         * server shall respond with RESOURCE_EXHAUSTED.
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
         * The server shall support the storage of up to 4 list entries in this attribute. The server may support the
         * storage of more than 4 entries in this attribute.
         *
         * When reading from this attribute, the server shall respond with the actual contents of the attribute which
         * may contain any number of entries (possibly more than 4), When writing to this attribute, a client may
         * include any number of entries to be written, or none at all.
         *
         * If an attempt is made to write to this attribute with a list length that is not supported by the server, the
         * server shall respond with RESOURCE_EXHAUSTED.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
         */
        labelList: Label.LabelStruct[];
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

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
