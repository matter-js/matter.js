/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    certCameraCase,
    expectControlAccepted,
    expectNoneAccepted,
    expectRefusal,
    expectSessionHeld,
    provideIceCandidates,
    provideOffer,
} from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.6",
    script: "TC_WEBRTCR_2_6.py",
    subpath: "test_TC_WebRTCR_2_6",
    title: "Validate ICECandidates command with invalid session id [DUT_Requestor]",
    signalPrompt: /Send 'ProvideOffer' command to the server app from DUT:/,
    signalStep: "5",

    async prove(cx, session) {
        const held = await provideOffer(session);

        // The provider forwards its own candidates only once it has some from us, and it is those the
        // injected fault gives a session id the DUT never established.
        await provideIceCandidates(session, held);

        const refusal = await expectRefusal(cx, session, "iceCandidates", held);
        if (!refusal.passed || refusal.refusedId === undefined) {
            // The remaining checks all rest on a refusal having happened, and each costs a wait the
            // script's own timeout does not have room for
            return "fail";
        }
        const kept = await expectSessionHeld(cx, session, held);
        const noneAccepted = expectNoneAccepted(cx, session, "iceCandidates", refusal.refusedId);
        const control = await expectControlAccepted(cx, session, "iceCandidates", held, provideOffer);

        return kept && noneAccepted && control ? "pass" : "fail";
    },
});
