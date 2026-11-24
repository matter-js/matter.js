/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionType } from "#codec/MessageCodec.js";
import { FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION, requestFlagsForSending } from "#interaction/RequestFlags.js";

const REVISION = FALSE_REQUEST_FLAGS_OMITTED_FROM_REVISION;

function sessionOf(type: SessionType, peerRevision = 12) {
    return { type, parameters: { interactionModelRevision: peerRevision } };
}

const allFalse = { suppressResponse: false, timedRequest: false, invokeRequests: [] };

describe("requestFlagsForSending", () => {
    it("sends both flags below the revision that leaves out false flags", () => {
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Group), REVISION - 1)).deep.equals(allFalse);
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Unicast, REVISION), REVISION - 1)).deep.equals(
            allFalse,
        );
    });

    it("leaves out false flags of a group request", () => {
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Group), REVISION)).deep.equals({
            invokeRequests: [],
        });
    });

    it("leaves out false flags of a request to a peer at that revision", () => {
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Unicast, REVISION), REVISION)).deep.equals({
            invokeRequests: [],
        });
    });

    it("sends both flags to a peer below that revision", () => {
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Unicast, REVISION - 1), REVISION)).deep.equals(
            allFalse,
        );
    });

    it("keeps a flag that is true", () => {
        const timed = { suppressResponse: false, timedRequest: true, invokeRequests: [] };

        expect(requestFlagsForSending(timed, sessionOf(SessionType.Unicast, REVISION), REVISION)).deep.equals({
            timedRequest: true,
            invokeRequests: [],
        });
    });

    // Characterization: fails once this node's revision is raised, as a reminder that peers then get fewer flags
    it("sends both flags at the current revision of this node", () => {
        expect(requestFlagsForSending(allFalse, sessionOf(SessionType.Group))).deep.equals(allFalse);
    });
});
