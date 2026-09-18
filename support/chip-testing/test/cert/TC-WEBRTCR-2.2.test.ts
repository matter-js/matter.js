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
    NOT_FOUND,
    provideOffer,
} from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.2",
    script: "TC_WEBRTCR_2_2.py",
    subpath: "test_TC_WebRTCR_2_2",
    title: "Validate Answer command with invalid session id [DUT_Requestor]",
    signalPrompt: /Send 'ProvideOffer' command to the server app from DUT:/,
    signalStep: "5",

    async prove(cx, session) {
        // The DUT offers here rather than soliciting, so the provider answers, and it is that Answer
        // the injected fault gives a session id the DUT never established.
        const held = await provideOffer(session);

        const refused = await expectRefusal(cx, session, "answer", held, NOT_FOUND);
        const kept = await expectSessionHeld(cx, session, held);
        const noneAccepted = expectNoneAccepted(cx, session, "answer");
        const control = await expectControlAccepted(cx, session, "answer", held, provideOffer);

        return refused && kept && noneAccepted && control ? "pass" : "fail";
    },
});
