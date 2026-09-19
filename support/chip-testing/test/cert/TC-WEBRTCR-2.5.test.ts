/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import {
    certCameraCase,
    endSession,
    establishSession,
    expectEstablished,
    expectSessions,
} from "./tc-webrtcr-support.js";

/** `WebRtcEndReasonEnum.UserHangup`, which the plan's own `end-session` step states. */
const USER_HANGUP = 2;

/** What the case's three `CurrentSessions` reads need to tell themselves apart. */
interface Progress {
    established?: number;
    ended: boolean;

    /** Which of the script's three reads of the attribute this is; they share one prompt. */
    reads: number;
}

certCameraCase<Progress>({
    tc: "TC-WEBRTCR-2.5",
    script: "TC_WEBRTCR_2_5.py",
    subpath: "test_TC_WebRTCR_2_5",
    title: "Validate CurrentSessions attribute read [DUT_Requestor]",
    commissioning: "manual-code",

    begin: () => ({ ended: false, reads: 0 }),

    steps: [
        {
            prompt: /Read CurrentSessions attribute from DUT:/,
            // The plan numbers the three reads 4, 6 and 8, and the script prints one prompt for all of
            // them, so the step this answers follows from how many have gone before
            step: progress => ["4", "6", "8"][progress.reads] ?? "8",

            async run(cx, session, progress) {
                progress.reads++;

                if (progress.established === undefined || progress.ended) {
                    return (await expectSessions(cx, session, [])) ? "pass" : "fail";
                }

                const held = await expectSessions(cx, session, [progress.established]);

                // This read answers with the session id itself, which the script puts in the
                // end-session command it prompts for next
                return { verdict: held ? ("pass" as const) : ("fail" as const), answer: `${progress.established}` };
            },
        },

        {
            prompt: /Establish WebRTC session between TH_SERVER and DUT:/,
            step: "5",

            async run(cx, session, progress) {
                const outcome = await establishSession(session, "provide");
                progress.established = outcome.id;
                return expectEstablished(cx, session, outcome) ? "pass" : "fail";
            },
        },

        {
            prompt: /End the WebRTC session:/,
            step: "7",

            async run(cx, session, progress) {
                if (progress.established === undefined) {
                    throw new InternalError("The script asked to end a session the case never established");
                }

                await endSession(session, progress.established, USER_HANGUP);
                progress.ended = true;

                // That the DUT dropped the session is what the script's last read proves; this step
                // states only that TH_SERVER accepted the command
                cx.recorder.check({
                    type: "response",
                    verdict: "pass",
                    detail: `TH_SERVER accepted EndSession for session ${progress.established}`,
                });

                return "pass";
            },
        },
    ],
});
