/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis } from "@matter/general";
import { runActionToCompletion } from "../src/otbr-rest/OtbrRestActionRunner.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";

class ScriptedActionClient {
    calls = 0;
    constructor(private readonly statuses: Array<{ status: string; resultId?: string }>) {}
    async getAction(_id: string): Promise<{ status: string; resultId?: string }> {
        const entry = this.statuses[Math.min(this.calls, this.statuses.length - 1)];
        this.calls++;
        return entry;
    }
}

describe("runActionToCompletion", () => {
    before(MockTime.enable);

    it("polls until the action reaches completed and returns the result id", async () => {
        const client = new ScriptedActionClient([
            { status: "pending" },
            { status: "active" },
            { status: "completed", resultId: "diag-1" },
        ]);
        const promise = runActionToCompletion(client, "act-1", { pollInterval: Millis(100), timeout: Millis(5000) });
        for (let i = 0; i < 3; i++) {
            await MockTime.yield();
            await MockTime.advance(100);
        }
        const result = await promise;
        expect(result.status).to.equal("completed");
        expect(result.resultId).to.equal("diag-1");
        expect(client.calls).to.equal(3);
    });

    it("returns immediately on a terminal stopped status without sleeping", async () => {
        const client = new ScriptedActionClient([{ status: "stopped" }]);
        const result = await runActionToCompletion(client, "x", { pollInterval: Millis(100), timeout: Millis(5000) });
        expect(result.status).to.equal("stopped");
        expect(result.resultId).to.be.undefined;
        expect(client.calls).to.equal(1);
    });

    it("throws rest_protocol when the action never reaches a terminal status before timeout", async () => {
        const client = new ScriptedActionClient([{ status: "pending" }]);
        const caught = runActionToCompletion(client, "x", { pollInterval: Millis(100), timeout: Millis(250) }).catch(
            (e: unknown) => e,
        );
        for (let i = 0; i < 4; i++) {
            await MockTime.yield();
            await MockTime.advance(100);
        }
        const err = await caught;
        expect(err).to.be.instanceOf(OtbrRestError);
        expect((err as OtbrRestError).code).to.equal("rest_protocol");
    });
});
