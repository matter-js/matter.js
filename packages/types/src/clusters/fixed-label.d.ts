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
 * Definitions for the FixedLabel cluster.
 *
 * This cluster is derived from the Label cluster and provides a feature for the device to tag an endpoint with zero or
 * more read-only labels.
 *
 * Examples:
 *
 *   - A bridge can use this to indicate grouping of bridged devices. For example: All bridged devices whose endpoints
 *     have an entry in their LabelList "room":"bedroom 2" are in the same (bed)room.
 *
 *   - A manufacturer can use this to identify a characteristic of an endpoint. For example to identify the endpoints of
 *     a luminaire, one pointing up, the other pointing down, one of the endpoints would have a LabelList entry
 *     "orientation":"up" while the other would have "orientation":"down". Using such indication, the user interface of
 *     a Node controlling this luminaire knows which of the endpoints is which of the lights.
 *
 * Note that the TagList in the Descriptor cluster provides an alternative mechanism for such self-description using
 * standardized tags rather than manufacturer-selected strings, yielding a standardized mechanism for features defined
 * in the various namespaces. The second example above can be implemented using semantic tags Direction.Upward and
 * Direction.Downward instead of (or in addition to) the Fixed Label cluster.
 *
 * @see {@link MatterSpecification.v142.Core} § 9.8
 */
export declare namespace FixedLabel {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0040;

    /**
     * Textual cluster identifier.
     */
    export const name: "FixedLabel";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the FixedLabel cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link FixedLabel} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * @see {@link MatterSpecification.v142.Core} § 9.8.4
         */
        labelList: Label.LabelStruct[];
    }

    /**
     * Attributes that may appear in {@link FixedLabel}.
     */
    export interface Attributes {
        /**
         * @see {@link MatterSpecification.v142.Core} § 9.8.4
         */
        labelList: Label.LabelStruct[];
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link FixedLabel}.
     */
    export const Cluster: typeof FixedLabel;

    /**
     * @deprecated Use {@link FixedLabel}.
     */
    export const Complete: typeof FixedLabel;

    export const Typing: FixedLabel;
}

/**
 * @deprecated Use {@link FixedLabel}.
 */
export declare const FixedLabelCluster: typeof FixedLabel;

export interface FixedLabel extends ClusterTyping {
    Attributes: FixedLabel.Attributes;
    Components: FixedLabel.Components;
}
