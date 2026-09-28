/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";
import type { ReachingEndpoints } from "./ReachingEndpoints.js";

/**
 * What the owner of a tree keeps of it across validation passes, so a pass does not walk a whole node scope or a whole
 * set of siblings for it. A pass created without an index walks the tree instead.
 *
 * The owner must answer as a walk of the tree would at the time of the call, so it must observe every change to what
 * it answers from.
 *
 * @internal
 */
export interface DeviceTypeScopeIndex<E> {
    /**
     * The endpoints of the node scope of {@link nodeEndpoint} that reach beyond their subtree: exactly those whose
     * {@link DeviceTypeValidationPass.reachOf reach} is not `None`, as a walk of the scope finds them. The owner adds
     * and removes members as the tree changes, and invalidates a member whose contribution may have changed without a
     * change to the member itself, such as its Base `Duplicate` condition.
     */
    reachingOf(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): ReachingEndpoints<E>;

    /**
     * The endpoints of the node scope of {@link nodeEndpoint}, the node endpoint included, whose device types include
     * {@link deviceTypeId}, exactly as a walk of the scope finds them, in no particular order.
     */
    scopeListing(nodeEndpoint: E, deviceTypeId: number, pass: DeviceTypeValidationPass<E>): Iterable<E>;

    /**
     * The parts of {@link parent} whose device types include {@link deviceTypeId}. It may leave out parts that are not
     * {@link DeviceTypeFacts.isPresent present} and may list parts that are not; the caller filters by presence.
     */
    partsListing(parent: E, deviceTypeId: number): Iterable<E>;
}
