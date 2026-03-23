/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { Label } from "./label.js";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { FixedLabel as FixedLabelModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FixedLabel cluster.
 */
export namespace FixedLabel {
    /**
     * Attributes that may appear in {@link FixedLabel}.
     */
    export interface Attributes {
        /**
         * @see {@link MatterSpecification.v142.Core} § 9.8.4
         */
        labelList: Label.LabelStruct[];
    }

    export namespace Attributes {
        export type Components = [{ flags: {}, mandatory: "labelList" }];
    }

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x40,
        name: "FixedLabel",
        revision: 1,

        attributes: {
            /**
             * @see {@link MatterSpecification.v142.Core} § 9.8.4
             */
            labelList: Attribute(0x0, TlvArray(Label.TlvLabelStruct), { persistent: true, default: [] })
        }
    });

    /**
     * This cluster is derived from the Label cluster and provides a feature for the device to tag an endpoint with zero
     * or more read-only labels.
     *
     * Examples:
     *
     *   - A bridge can use this to indicate grouping of bridged devices. For example: All bridged devices whose
     *     endpoints have an entry in their LabelList "room":"bedroom 2" are in the same (bed)room.
     *
     *   - A manufacturer can use this to identify a characteristic of an endpoint. For example to identify the
     *     endpoints of a luminaire, one pointing up, the other pointing down, one of the endpoints would have a
     *     LabelList entry "orientation":"up" while the other would have "orientation":"down". Using such indication,
     *     the user interface of a Node controlling this luminaire knows which of the endpoints is which of the lights.
     *
     * Note that the TagList in the Descriptor cluster provides an alternative mechanism for such self-description using
     * standardized tags rather than manufacturer-selected strings, yielding a standardized mechanism for features
     * defined in the various namespaces. The second example above can be implemented using semantic tags
     * Direction.Upward and Direction.Downward instead of (or in addition to) the Fixed Label cluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.8
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x40);
    export const name = "FixedLabel" as const;
    export const revision = 1;
    export const schema = FixedLabelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: FixedLabel;
}

export type FixedLabelCluster = FixedLabel.Cluster;
export const FixedLabelCluster = FixedLabel.Cluster;
ClusterNamespace.define(FixedLabel);
export interface FixedLabel extends ClusterTyping { Attributes: FixedLabel.Attributes & { Components: FixedLabel.Attributes.Components } }
