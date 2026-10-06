/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certCameraCase, establishSession, expectEstablished } from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.3",
    script: "TC_WEBRTCR_2_3.py",
    subpath: "test_TC_WebRTCR_2_3",
    title: "Validate Offer command with valid session id [DUT_Requestor]",
    commissioning: "fixed-passcode",

    steps: [
        {
            prompt: /Send 'SolicitOffer' command to the server app from DUT:/,
            step: "2",

            async run(cx, session) {
                // The DUT solicits, so the provider offers and the DUT answers. Unlike the cases that
                // end in a refusal, the plan asks here for a session that works, which is a connected
                // peer connection rather than an accepted command.
                return expectEstablished(cx, session, await establishSession(session, "solicit")) ? "pass" : "fail";
            },
        },
    ],
});
