/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis, Seconds } from "@matter/general";
import { SessionIntervals, SessionManager } from "@matter/protocol";
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
});
