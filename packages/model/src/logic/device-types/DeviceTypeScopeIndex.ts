/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";

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
     * The endpoints of the node scope of {@link nodeEndpoint} that reach beyond their subtree, in tree order: those
     * whose {@link DeviceTypeValidationPass.reachOf reach} is not `None`. It may also list endpoints of the scope whose
     * reach is `None` now; a pass reads each listed endpoint's facts anew.
     */
    reachingOf(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): readonly E[];

    /**
     * The parts of {@link parent} whose device types include {@link deviceTypeId}. It may leave out parts that are not
     * {@link DeviceTypeFacts.isPresent present} and may list parts that are not; the caller filters by presence.
     */
    partsListing(parent: E, deviceTypeId: number): Iterable<E>;
}
