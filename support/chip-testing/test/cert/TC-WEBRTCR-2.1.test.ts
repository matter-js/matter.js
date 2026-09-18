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
    solicitOffer,
} from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.1",
    script: "TC_WEBRTCR_2_1.py",
    subpath: "test_TC_WebRTCR_2_1",
    title: "Validate Offer command with invalid session id [DUT_Requestor]",
    signalPrompt: /Send 'SolicitOffer' command to the server app from DUT:/,
    signalStep: "5",

    async prove(cx, session) {
        const held = await solicitOffer(session);

        const refused = await expectRefusal(cx, session, "offer", held, NOT_FOUND);
        const kept = await expectSessionHeld(cx, session, held);
        const noneAccepted = expectNoneAccepted(cx, session, "offer");
        const control = await expectControlAccepted(cx, session, "offer", held, solicitOffer);

        return refused && kept && noneAccepted && control ? "pass" : "fail";
    },
});
