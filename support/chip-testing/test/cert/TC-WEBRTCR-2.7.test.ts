/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    certCameraCase,
    expectConstraintRefusal,
    expectControlAccepted,
    expectSessionHeld,
    provideIceCandidates,
    provideOffer,
} from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.7",
    script: "TC_WEBRTCR_2_7.py",
    subpath: "test_TC_WebRTCR_2_7",
    title: "Validate ICECandidates command with empty candidate list [DUT_Requestor]",
    signalPrompt: /Send 'ProvideOffer' command to the server app from DUT:/,
    signalStep: "5",

    async prove(cx, session) {
        const held = await provideOffer(session);

        // The fault empties the candidate list rather than changing the session id, so the session the
        // signaling names is one the DUT holds: what it must refuse is the payload, and the field's own
        // "min 1" constraint is why.
        const from = cx.controllers.dut.log.mark();
        await provideIceCandidates(session, held);

        const refused = await expectConstraintRefusal(cx, from);
        const kept = await expectSessionHeld(cx, session, held);
        const control = await expectControlAccepted(cx, session, "iceCandidates", held, provideOffer);

        return refused && kept && control ? "pass" : "fail";
    },
});
