/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sender options for the SuppressResponse and TimedRequest flags of an Invoke or Write request.
 */
export interface RequestFlagsOptions {
    /**
     * Leave out SuppressResponse and TimedRequest when false, whatever the Interaction Model revisions of this node and
     * the receiver are.  Set it only when every receiver is known to support Interaction Model revision 14 or later.  A
     * CHIP receiver below that revision refuses an Invoke without either flag and a Write without TimedRequest with
     * INVALID_ACTION; a group request fails without any response.  This saves up to four bytes, which can keep a
     * request within one Thread frame.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.7.2.1
     * @see {@link MatterSpecification.v161.Core} § 8.8.2.1
     */
    omitFalseFlags?: boolean;
}
