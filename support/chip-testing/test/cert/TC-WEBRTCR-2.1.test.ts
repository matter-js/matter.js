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
    solicitOffer,
} from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.1",
    script: "TC_WEBRTCR_2_1.py",
    subpath: "test_TC_WebRTCR_2_1",
    title: "Validate Offer command with invalid session id [DUT_Requestor]",
    commissioning: "manual-code",

    steps: [
        {
            prompt: /Send 'SolicitOffer' command to the server app from DUT:/,
            step: "5",

            async run(cx, session) {
                const held = await solicitOffer(session);

                const refusal = await expectRefusal(cx, session, "offer", held);
                if (!refusal.passed || refusal.refusedId === undefined) {
                    // The remaining checks all rest on a refusal having happened, and each costs a wait the
                    // script's own timeout does not have room for
                    return "fail";
                }
                const kept = await expectSessionHeld(cx, session, held);
                const noneAccepted = expectNoneAccepted(cx, session, "offer", refusal.refusedId);
                const control = await expectControlAccepted(cx, session, "offer", held, solicitOffer);

                return kept && noneAccepted && control ? "pass" : "fail";
            },
        },
    ],
});
