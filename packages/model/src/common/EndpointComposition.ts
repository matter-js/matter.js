/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How a device type composes the `PartsList` of the endpoint it is on.
 *
 * A part's parent is not on the wire — `Descriptor` has no attribute naming it — so a node
 * reconstructing another node's endpoint tree has only these lists to go on, and what a list means
 * depends on the device type reporting it.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.3
 */
export enum EndpointComposition {
    /**
     * The `PartsList` names the endpoint's own children, so it is a parent's list of its parts.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     */
    Tree = "tree",

    /**
     * The `PartsList` names every descendant, "with no imposed hierarchy" — so it says that a part is
     * somewhere below the endpoint and nothing about which endpoint owns it.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     */
    FullFamily = "full-family",
}
