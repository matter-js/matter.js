/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { Hours, Millis, Seconds, Time } from "@matter/general";
import { SessionIntervals, SessionManager } from "@matter/protocol";
import { NodeId } from "@matter/types";
import { MockServerNode } from "../../../node/mock-server-node.js";

describe("SessionsBehavior", () => {
    describe("intervals configuration", () => {
        it("applies configured intervals to the SessionManager", async () => {
            const node = await MockServerNode.createOnline(undefined, {
                sessions: { intervals: { idleInterval: Millis(1000), activeThreshold: Seconds(6) } },
            });

            const parameters = node.env.get(SessionManager).sessionParameters;
            expect(parameters.idleInterval).equals(Millis(1000));
            expect(parameters.activeThreshold).equals(Seconds(6));

            await node.close();
        });

        it("retains defaults for intervals left unset", async () => {
            const node = await MockServerNode.createOnline(undefined, {
                sessions: { intervals: { idleInterval: Millis(1000) } },
            });

            const parameters = node.env.get(SessionManager).sessionParameters;
            expect(parameters.activeInterval).equals(SessionIntervals.defaults.activeInterval);
            expect(parameters.activeThreshold).equals(SessionIntervals.defaults.activeThreshold);

            await node.close();
        });
    });

    describe("exposed sessions", () => {
        it("reports session activity on the wall clock", async () => {
            const node = await MockServerNode.createOnline();
            MockTime.stepWallClock(Hours(1));

            const session = await node.env.get(SessionManager).createSecureSession({
                id: 0x0100,
                fabric: undefined,
                peerNodeId: NodeId(0x1234n),
                peerSessionId: 0x0100,
                sharedSecret: new Uint8Array(),
                salt: new Uint8Array(),
                isInitiator: false,
                isResumption: false,
            });

            const exposed = node.stateOf(SessionsBehavior).sessions[session.id];
            expect(exposed.lastInteractionTimestamp).equals(Time.nowMs);
            expect(exposed.lastActiveTimestamp).equals(Time.nowMs);

            await node.close();
        });
    });
});
