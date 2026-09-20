/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certCameraCase, establishSession, expectEstablished } from "./tc-webrtcr-support.js";

certCameraCase({
    tc: "TC-WEBRTCR-2.4",
    script: "TC_WEBRTCR_2_4.py",
    subpath: "test_TC_WebRTCR_2_4",
    title: "Validate Answer command with valid session id [DUT_Requestor]",
    commissioning: "fixed-passcode",

    steps: [
        {
            prompt: /Send 'ProvideOffer' command to the server app from DUT:/,
            step: "2",

            // The DUT offers, so the provider answers: the Answer the plan is about is the one that
            // carries the session through to a connected peer connection.
            async run(cx, session) {
                return expectEstablished(cx, session, await establishSession(session, "provide")) ? "pass" : "fail";
            },
        },
    ],
});
