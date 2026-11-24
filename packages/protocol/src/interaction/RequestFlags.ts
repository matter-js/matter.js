/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionType } from "#codec/MessageCodec.js";
import { Specification } from "@matter/model";

/**
 * The Interaction Model revision from which a sender leaves out a SuppressResponse or TimedRequest that is false.
 */
export const FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION = 14;

/**
 * Prepares the SuppressResponse and TimedRequest flags of an Invoke or Write request for sending.
 *
 * Once {@link ownRevision} reaches {@link FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION}, a false flag is left out of a
 * group request and of a request to a peer that reported that revision or later, as the CHIP SDK does; a receiver
 * treats a missing flag as false.  Below that revision both flags are sent as given.
 *
 * @param session the session the request is sent on
 * @param ownRevision the Interaction Model revision of this node
 */
export function requestFlagsForSending<T extends { suppressResponse?: boolean; timedRequest?: boolean }>(
    request: T,
    session: { type: SessionType; parameters: { interactionModelRevision: number } },
    ownRevision: number = Specification.INTERACTION_MODEL_REVISION,
): T {
    if (
        ownRevision < FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION ||
        (session.type !== SessionType.Group &&
            session.parameters.interactionModelRevision < FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION)
    ) {
        return request;
    }

    const result = { ...request };
    if (result.suppressResponse === false) {
        delete result.suppressResponse;
    }
    if (result.timedRequest === false) {
        delete result.timedRequest;
    }
    return result;
}
