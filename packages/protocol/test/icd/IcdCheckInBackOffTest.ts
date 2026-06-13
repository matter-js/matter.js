/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/general";
import { DoublingCheckInBackOff } from "../../src/icd/IcdCheckInBackOff.js";

/** Advance `cycles` idle→active wakes; return the cycle indices at which a send was due. */
function sendCycles(backoff: DoublingCheckInBackOff, key: string, cycles: number): number[] {
    const out = new Array<number>();
    for (let c = 0; c < cycles; c++) {
        if (backoff.shouldSend(key)) {
            out.push(c);
            backoff.recordSent(key);
        }
    }
    return out;
}

describe("DoublingCheckInBackOff", () => {
    it("doubles the gap, capped at maximumCheckInBackoff", () => {
        const backoff = new DoublingCheckInBackOff(Seconds(60), Seconds(960)); // maxCycles = 16
        expect(sendCycles(backoff, "a", 64)).deep.equals([0, 1, 3, 7, 15, 31, 47, 63]);
    });

    it("never backs off when maximumCheckInBackoff equals idleModeDuration", () => {
        const backoff = new DoublingCheckInBackOff(Seconds(60), Seconds(60)); // maxCycles = 1
        expect(sendCycles(backoff, "a", 5)).deep.equals([0, 1, 2, 3, 4]);
    });

    it("recordAnswered resets to immediate", () => {
        const backoff = new DoublingCheckInBackOff(Seconds(60), Seconds(960));
        backoff.shouldSend("a");
        backoff.recordSent("a"); // missed=1
        backoff.shouldSend("a");
        backoff.recordSent("a"); // missed=2 -> waiting 2 cycles
        backoff.recordAnswered("a");
        expect(backoff.shouldSend("a")).equals(true);
    });

    it("resetAll resets every client", () => {
        const backoff = new DoublingCheckInBackOff(Seconds(60), Seconds(960));
        for (const k of ["a", "b"]) {
            backoff.shouldSend(k);
            backoff.recordSent(k);
            backoff.shouldSend(k);
            backoff.recordSent(k);
        }
        backoff.resetAll();
        expect(backoff.shouldSend("a")).equals(true);
        expect(backoff.shouldSend("b")).equals(true);
    });

    it("forget drops a client's state", () => {
        const backoff = new DoublingCheckInBackOff(Seconds(60), Seconds(960));
        backoff.shouldSend("a");
        backoff.recordSent("a");
        backoff.forget("a");
        expect(backoff.shouldSend("a")).equals(true);
    });
});
