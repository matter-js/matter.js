/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventReadEntry } from "@matter/testing";
import { expect } from "chai";
import type { GatedObservation } from "../../src/cert/event-read-gate.js";
import { EventReadGate } from "../../src/cert/event-read-gate.js";

function entry(eventNumber: bigint): EventReadEntry {
    return { endpoint: 1, cluster: 0x45, event: 0, eventNumber, value: undefined };
}

function observe(gate: EventReadGate<string>, peer: string) {
    const released = new Array<bigint>();
    const observation: GatedObservation<string> = {
        peer,
        held: new Array<EventReadEntry>(),
        release: entries => released.push(...entries.map(({ eventNumber }) => eventNumber)),
    };
    gate.attach(observation);
    return { observation, released };
}

/** A read that returns `numbers` once the test finishes it. */
function startRead(gate: EventReadGate<string>, peer: string, numbers: bigint[]) {
    let finish = () => {};
    const done = gate.reading(
        peer,
        numbers.map(number => ({ number })),
        () => new Promise<void>(resolve => (finish = resolve)),
    );
    return async () => {
        finish();
        await done;
    };
}

describe("EventReadGate", () => {
    it("releases what arrives while no read of the peer runs", () => {
        const gate = new EventReadGate<string>();
        const { observation, released } = observe(gate, "a");

        gate.admit(observation, entry(1n));

        expect(released).deep.equal([1n]);
    });

    it("drops what only the read brought in", async () => {
        const gate = new EventReadGate<string>();
        const { observation, released } = observe(gate, "a");

        const finish = startRead(gate, "a", [1n]);
        gate.admit(observation, entry(1n));
        await finish();

        expect(released).deep.equal([]);
    });

    it("keeps the subscription's copy of an event the read also returned", async () => {
        const gate = new EventReadGate<string>();
        const { observation, released } = observe(gate, "a");

        const finish = startRead(gate, "a", [1n]);
        gate.admit(observation, entry(1n));
        gate.admit(observation, entry(1n));
        gate.admit(observation, entry(2n));
        expect(released).deep.equal([]);
        await finish();

        expect(released).deep.equal([1n, 2n]);
    });

    for (const order of ["first-started first", "last-started first"] as const) {
        it(`holds until every overlapping read finished, ${order}`, async () => {
            const gate = new EventReadGate<string>();
            const { observation, released } = observe(gate, "a");

            const finishFirst = startRead(gate, "a", [1n]);
            const finishSecond = startRead(gate, "a", [2n]);
            for (const number of [1n, 2n, 3n]) {
                gate.admit(observation, entry(number));
            }

            const [early, late] =
                order === "first-started first" ? [finishFirst, finishSecond] : [finishSecond, finishFirst];
            await early();
            expect(released).deep.equal([]);
            await late();

            expect(released).deep.equal([3n]);
        });
    }

    it("does not hold another peer's observation", async () => {
        const gate = new EventReadGate<string>();
        const { observation, released } = observe(gate, "b");

        const finish = startRead(gate, "a", [1n]);
        gate.admit(observation, entry(1n));
        expect(released).deep.equal([1n]);
        await finish();

        expect(released).deep.equal([1n]);
    });
});
