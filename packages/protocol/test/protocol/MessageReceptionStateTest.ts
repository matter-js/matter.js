/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAX_COUNTER_VALUE_32BIT } from "#protocol/MessageCounter.js";
import {
    DuplicateMessageError,
    MessageReceptionStateEncryptedWithoutRollover,
    MessageReceptionStateEncryptedWithRollover,
    MessageReceptionStateUnencryptedWithRollover,
} from "#protocol/MessageReceptionState.js";
import { InternalError } from "@matter/general";

const MAX_COUNTER_INCREASE_2POW31 = Math.pow(2, 31);
const MSG_COUNTER_WINDOW_SIZE = 32;

function assertMessageWindowUpdate(
    prototype: any,
    state: MessageReceptionStateEncryptedWithoutRollover,
    messageCounter: number,
    expectedBitMap: number,
    expectedDuplicate: boolean,
    expectedDiff: number,
) {
    let updatedBitMap;
    MockTime.interceptOnce(
        // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        prototype,
        "calculateMessageCounterBitmap",
        result => {
            updatedBitMap = result.resolve;
            return result;
        },
    );

    let calculatedDiff;
    MockTime.interceptOnce(
        // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        prototype,
        "calculateDiff",
        result => {
            calculatedDiff = result.resolve;
            return result;
        },
    );

    let isDuplicate = false;
    try {
        state.updateMessageCounter(messageCounter);
    } catch (error) {
        if (error instanceof DuplicateMessageError) {
            isDuplicate = true;
        }
    }
    expect(calculatedDiff).equal(expectedDiff);
    expect(updatedBitMap).equal(expectedBitMap);
    expect(isDuplicate).equal(expectedDuplicate);
}

function assertMessageWindowDifference(
    prototype: any,
    state: MessageReceptionStateEncryptedWithoutRollover,
    messageCounter: number,
    expectedDuplicate: boolean,
    expectedDiff: number,
) {
    let calculatedDiff;
    MockTime.interceptOnce(
        // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        prototype,
        "calculateDiff",
        result => {
            calculatedDiff = result.resolve;
            return result;
        },
    );

    let isDuplicate = false;
    try {
        state.updateMessageCounter(messageCounter);
    } catch (error) {
        if (error instanceof DuplicateMessageError) {
            isDuplicate = true;
        }
    }
    expect(calculatedDiff).equal(expectedDiff);
    expect(isDuplicate).equal(expectedDuplicate);
}

function expectEachWindowCounterAcceptedOnce(state: MessageReceptionStateEncryptedWithoutRollover, max: number) {
    for (let offset = 1; offset <= MSG_COUNTER_WINDOW_SIZE; offset++) {
        const counter = (max - offset) >>> 0;
        expect(() => state.updateMessageCounter(counter), `first ${counter}`).not.throws();
    }
    for (let offset = 1; offset <= MSG_COUNTER_WINDOW_SIZE; offset++) {
        const counter = (max - offset) >>> 0;
        expect(() => state.updateMessageCounter(counter), `replay ${counter}`).throws(DuplicateMessageError);
    }
    expect(() => state.updateMessageCounter(max)).throws(DuplicateMessageError);
}

describe("MessageReceptionState", () => {
    describe("MessageReceptionStateEncryptedWithoutRollover", () => {
        describe("generic tests", () => {
            it("state gets initialized by first counter value", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1234);
                expect(updateCalled).equal(true);

                assertMessageWindowUpdate(prototype, state, 0x1235, 0b11111111111111111111111111111111, false, 1);
            });

            it("correct difference gets calculated and state gets updated after being initialized", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1235);
                expect(calculatedDiff).equal(1);
                expect(updateCalled).equal(true);
            });
        });

        describe("Message counter window tests", () => {
            it("duplicate counter value (same value) within window is detected", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(undefined);
                expect(updateCalled).equal(false);
            });

            it("duplicate counter value (value -1) within window is detected", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                state.updateMessageCounter(0x1234);
                state.updateMessageCounter(0x1235);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(-1);
                expect(updateCalled).equal(false);
            });

            it("no duplicate is detected on first message higher than start", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover(0);
                state.updateMessageCounter(0x1235);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithoutRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).not.throw;
                expect(calculatedDiff).equal(undefined);
                expect(updateCalled).equal(false);
            });

            it("value tests within counter window", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(96);
                assertMessageWindowUpdate(prototype, state, 100, 0b1000, false, 4);
                assertMessageWindowUpdate(prototype, state, 97, 0b1100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b11001, false, 1);
                assertMessageWindowUpdate(prototype, state, 103, 0b1100110, false, 2);
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                assertMessageWindowUpdate(prototype, state, 95, 0b11100110, false, -8);
                assertMessageWindowUpdate(prototype, state, 73, 0b100000000000000000000011100110, false, -30);
                assertMessageWindowUpdate(prototype, state, 72, 0b1100000000000000000000011100110, false, -31);
                assertMessageWindowUpdate(prototype, state, 71, 0b11100000000000000000000011100110, false, -32); // 32 bit reached
                // Verify some values within bitmap again
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(101)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(103)).throws(DuplicateMessageError);
                state.updateMessageCounter(102);
            });

            it("value tests on counter window edges", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(103);
                assertMessageWindowUpdate(prototype, state, 100, 0b100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b110, false, -2);
                assertMessageWindowUpdate(prototype, state, 96, 0b1000110, false, -7);
                expect(() => state.updateMessageCounter(70)).throws(DuplicateMessageError); // outside window is always duplicate
                assertMessageWindowUpdate(prototype, state, 71, 0b10000000000000000000000001000110, false, -32); // 32 bit reached
                assertMessageWindowUpdate(prototype, state, 105, 0b100011010, false, 2); // now we move the window
                expect(() => state.updateMessageCounter(70)).throws(DuplicateMessageError); // outside window is always duplicate
                expect(() => state.updateMessageCounter(71)).throws(DuplicateMessageError); // outside window is always duplicate
                expect(() => state.updateMessageCounter(72)).throws(DuplicateMessageError); // outside window is always duplicate
                assertMessageWindowUpdate(prototype, state, 73, 0b10000000000000000000000100011010, false, -32); // new window edge
            });

            it("value tests on range edges", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                state.updateMessageCounter(103);
                expect(() => state.updateMessageCounter(0)).throws(DuplicateMessageError);

                state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT);
                expect(() => state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 33)).throws(DuplicateMessageError);
                state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 32);
            });

            it("accepts a peer counter of 0xFFFFFFFF (maximum valid value)", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                expect(() => state.updateMessageCounter(0xffffffff)).not.throw();
            });

            it("rejects out-of-range counter values", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                expect(() => state.updateMessageCounter(-1)).throws(InternalError, "Invalid message counter value");
                expect(() => state.updateMessageCounter(0x100000000)).throws(
                    InternalError,
                    "Invalid message counter value",
                );
            });

            it("forward jump of exactly the window size clears stale bitmap bits", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                // Seed a low in-window bit (counter 94 = max - 6).
                assertMessageWindowUpdate(prototype, state, 94, 0b100000, false, -6);
                // Jump forward by exactly the window size: only the old max bit (offset 32 -> bit 31) survives.
                assertMessageWindowUpdate(prototype, state, 132, 0b10000000000000000000000000000000, false, 32);
                // Counter 126 (= new max - 6) was never received; its stale bit must have been cleared.
                assertMessageWindowUpdate(prototype, state, 126, 0b10000000000000000000000000100000, false, -6);
            });

            it("forward jump of window size - 1 keeps the oldest bit at the window edge", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 131, 0b11000000000000000000000000000000, false, 31);
                assertMessageWindowDifference(prototype, state, 99, true, -32);
                assertMessageWindowDifference(prototype, state, 100, true, -31);
                assertMessageWindowUpdate(prototype, state, 101, 0b11100000000000000000000000000000, false, -30);
            });

            it("forward jump of window size + 1 clears the whole window", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 133, 0b0, false, 33);
                assertMessageWindowDifference(prototype, state, 100, true, -33); // old max is behind the window
                assertMessageWindowUpdate(prototype, state, 101, 0b10000000000000000000000000000000, false, -32);
            });

            it("accepts every counter in the window exactly once", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover();
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                expectEachWindowCounterAcceptedOnce(state, 100);
                expect(() => state.updateMessageCounter(67)).throws(DuplicateMessageError); // behind the window
            });

            it("initial state with a non-zero max accepts only counters above max", () => {
                const state = new MessageReceptionStateEncryptedWithoutRollover(1000);
                const prototype = MessageReceptionStateEncryptedWithoutRollover.prototype;
                expect(() => state.updateMessageCounter(1000)).throws(DuplicateMessageError);
                assertMessageWindowDifference(prototype, state, 999, true, -1);
                assertMessageWindowDifference(prototype, state, 968, true, -32);
                assertMessageWindowDifference(prototype, state, 967, true, -33);
                assertMessageWindowUpdate(prototype, state, 1001, 0b11111111111111111111111111111111, false, 1);
                assertMessageWindowDifference(prototype, state, 969, true, -32);
            });
        });
    });

    describe("MessageReceptionStateEncryptedWithRollover", () => {
        describe("generic tests", () => {
            it("state gets initialized by first counter value", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1234);
                expect(updateCalled).equal(true);
                assertMessageWindowUpdate(prototype, state, 0x1235, 0b11111111111111111111111111111111, false, 1);
            });

            it("correct difference gets calculated and state gets updated after being initialized", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1235);
                expect(calculatedDiff).equal(1);
                expect(updateCalled).equal(true);
            });
        });

        describe("Message counter window tests", () => {
            it("duplicate counter value (same value) within window is detected", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(undefined);
                expect(updateCalled).equal(false);
            });

            it("duplicate counter value (value -1) within window is detected", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                state.updateMessageCounter(0x1234);
                state.updateMessageCounter(0x1235);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateEncryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(-1);
                expect(updateCalled).equal(false);
            });

            it("value tests within counter window", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(96);
                assertMessageWindowUpdate(prototype, state, 100, 0b1000, false, 4);
                assertMessageWindowUpdate(prototype, state, 97, 0b1100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b11001, false, 1);
                assertMessageWindowUpdate(prototype, state, 103, 0b1100110, false, 2);
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                assertMessageWindowUpdate(prototype, state, 95, 0b11100110, false, -8);
                assertMessageWindowUpdate(prototype, state, 73, 0b100000000000000000000011100110, false, -30);
                assertMessageWindowUpdate(prototype, state, 72, 0b1100000000000000000000011100110, false, -31);
                assertMessageWindowUpdate(prototype, state, 71, 0b11100000000000000000000011100110, false, -32); // 32 bit reached
                // Verify some values within bitmap again
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(101)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(103)).throws(DuplicateMessageError);
                state.updateMessageCounter(102);
            });

            it("value tests on counter window edges", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(103);
                assertMessageWindowUpdate(prototype, state, 100, 0b100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b110, false, -2);
                assertMessageWindowUpdate(prototype, state, 96, 0b1000110, false, -7);
                expect(() => state.updateMessageCounter(70)).throws(DuplicateMessageError); // outside window is always duplicate
                assertMessageWindowUpdate(prototype, state, 71, 0b10000000000000000000000001000110, false, -32); // 32 bit reached
                assertMessageWindowUpdate(prototype, state, 105, 0b100011010, false, 2); // now we move the window
                expect(() => state.updateMessageCounter(70)).throws(DuplicateMessageError); // outside window is always duplicate
                expect(() => state.updateMessageCounter(71)).throws(DuplicateMessageError); // outside window is always duplicate
                expect(() => state.updateMessageCounter(72)).throws(DuplicateMessageError); // outside window is always duplicate
                assertMessageWindowUpdate(prototype, state, 73, 0b10000000000000000000000100011010, false, -32); // new window edge
            });

            it("value tests on edges and duplicate values with low max-number and rollovers", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(103);
                assertMessageWindowUpdate(prototype, state, 71, 0b10000000000000000000000000000000, false, -32); // Lowest value in window, so this is not duplicate

                // Messages with counters from
                // [(max_message_counter - 2^31) to (max_message_counter - MSG_COUNTER_WINDOW_SIZE - 1)] (modulo 2^32)
                // SHALL be considered duplicate.
                assertMessageWindowDifference(prototype, state, 70, true, -33);
                assertMessageWindowDifference(prototype, state, 0, true, -103);
                // expectation: rollover happened
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT, true, -104);

                assertMessageWindowDifference(
                    prototype,
                    state,
                    103 + MAX_COUNTER_INCREASE_2POW31, // same as (max_message_counter - 2^31) % 2^32
                    true,
                    -MAX_COUNTER_INCREASE_2POW31,
                );
            });

            it("value tests on edges and duplicate values with high max-number and rollovers", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                const highBase = Math.pow(2, 30);
                state.updateMessageCounter(highBase);
                const highBase2 = Math.pow(2, 31) + 100_000;
                assertMessageWindowDifference(prototype, state, highBase2, false, highBase2 - highBase);

                assertMessageWindowDifference(
                    prototype,
                    state,
                    highBase2 - MAX_COUNTER_INCREASE_2POW31, // same as (max_message_counter - 2^31) % 2^32
                    true,
                    -MAX_COUNTER_INCREASE_2POW31,
                );
            });

            it("value tests on edges and new values with low max-number and rollovers", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(102);

                // For encrypted messages of Group Session Type, any arriving message with a counter in the range
                // [(max_message_counter + 1) to (max_message_counter + 2^31 - 1)] (modulo 2^32) SHALL be considered new

                assertMessageWindowUpdate(prototype, state, 103, 0b1, false, 1); // max_message_counter + 1

                assertMessageWindowUpdate(
                    prototype,
                    state,
                    103 + MAX_COUNTER_INCREASE_2POW31 - 1, // max_message_counter + 2^31 - 1
                    0b0,
                    false,
                    MAX_COUNTER_INCREASE_2POW31 - 1,
                );
            });

            it("value tests on edges and new values with high max-number and rollovers", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(103 + MAX_COUNTER_INCREASE_2POW31 - 1);

                const highBase = Math.pow(2, 31) + 100_000;
                assertMessageWindowDifference(prototype, state, highBase, false, 100_000 - 102);

                assertMessageWindowDifference(
                    prototype,
                    state,
                    highBase - MAX_COUNTER_INCREASE_2POW31 - 1, // same as (max_message_counter - 2^31) % 2^32
                    false,
                    MAX_COUNTER_VALUE_32BIT - highBase + (highBase - MAX_COUNTER_INCREASE_2POW31 - 1) + 1,
                );
            });

            it("forward jump of exactly the window size clears stale bitmap bits", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 94, 0b100000, false, -6);
                assertMessageWindowUpdate(prototype, state, 132, 0b10000000000000000000000000000000, false, 32);
                assertMessageWindowUpdate(prototype, state, 126, 0b10000000000000000000000000100000, false, -6);
            });

            it("forward jump of window size - 1 keeps the oldest bit at the window edge", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 131, 0b11000000000000000000000000000000, false, 31);
                assertMessageWindowDifference(prototype, state, 99, true, -32);
                assertMessageWindowDifference(prototype, state, 100, true, -31);
                assertMessageWindowUpdate(prototype, state, 101, 0b11100000000000000000000000000000, false, -30);
            });

            it("forward jump of window size + 1 clears the whole window", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 133, 0b0, false, 33);
                assertMessageWindowDifference(prototype, state, 100, true, -33);
                assertMessageWindowUpdate(prototype, state, 101, 0b10000000000000000000000000000000, false, -32);
            });

            it("forward jumps of window size - 1, window size and window size + 1 across the 2^32 wrap", () => {
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                const start = () => {
                    const state = new MessageReceptionStateEncryptedWithRollover(MAX_COUNTER_VALUE_32BIT - 40);
                    state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 5); // jump of 35 clears the window
                    assertMessageWindowUpdate(prototype, state, MAX_COUNTER_VALUE_32BIT - 6, 0b1, false, -1);
                    return state;
                };

                let state = start();
                assertMessageWindowUpdate(prototype, state, 25, 0b11000000000000000000000000000000, false, 31);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 6, true, -32);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 5, true, -31);
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 4,
                    0b11100000000000000000000000000000,
                    false,
                    -30,
                );

                state = start();
                assertMessageWindowUpdate(prototype, state, 26, 0b10000000000000000000000000000000, false, 32);
                assertMessageWindowUpdate(prototype, state, 25, 0b10000000000000000000000000000001, false, -1);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 5, true, -32);

                state = start();
                assertMessageWindowUpdate(prototype, state, 27, 0b0, false, 33);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 5, true, -33);
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 4,
                    0b10000000000000000000000000000000,
                    false,
                    -32,
                );
            });

            it("accepts every counter in the window exactly once", () => {
                const state = new MessageReceptionStateEncryptedWithRollover();
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                expectEachWindowCounterAcceptedOnce(state, 100);
                expect(() => state.updateMessageCounter(67)).throws(DuplicateMessageError);
            });

            it("accepts every counter in a window that spans the 2^32 wrap exactly once", () => {
                const state = new MessageReceptionStateEncryptedWithRollover(MAX_COUNTER_VALUE_32BIT - 40);
                state.updateMessageCounter(10); // jump of 51 across the wrap clears the window
                expectEachWindowCounterAcceptedOnce(state, 10);
                expect(() => state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 22)).throws(DuplicateMessageError);
            });

            it("initial state with a non-zero max accepts only counters above max", () => {
                const state = new MessageReceptionStateEncryptedWithRollover(1000);
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                expect(() => state.updateMessageCounter(1000)).throws(DuplicateMessageError);
                assertMessageWindowDifference(prototype, state, 999, true, -1);
                assertMessageWindowDifference(prototype, state, 968, true, -32);
                assertMessageWindowDifference(prototype, state, 967, true, -33);
                assertMessageWindowUpdate(prototype, state, 1001, 0b11111111111111111111111111111111, false, 1);
                assertMessageWindowDifference(prototype, state, 969, true, -32);
            });

            it("initial state with a small max rejects the window part behind the 2^32 wrap", () => {
                const state = new MessageReceptionStateEncryptedWithRollover(10);
                const prototype = MessageReceptionStateEncryptedWithRollover.prototype;
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 21, true, -32);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 22, true, -33);
                assertMessageWindowUpdate(prototype, state, 11, 0b11111111111111111111111111111111, false, 1);
            });
        });
    });
    describe("MessageReceptionStateUnencryptedWithRollover", () => {
        describe("generic tests", () => {
            it("state gets initialized by first counter value", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1234);
                expect(updateCalled).equal(true);
                assertMessageWindowUpdate(prototype, state, 0x1235, 0b1, false, 1);
            });

            it("correct difference gets calculated and state gets updated after being initialized", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );
                state.updateMessageCounter(0x1235);
                expect(calculatedDiff).equal(1);
                expect(updateCalled).equal(true);
            });
        });

        describe("Message counter window tests", () => {
            it("duplicate counter value (same value) within window is detected", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                state.updateMessageCounter(0x1234);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(undefined);
                expect(updateCalled).equal(false);
            });

            it("duplicate counter value (value -1) within window is detected", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                state.updateMessageCounter(1);
                state.updateMessageCounter(0x1234);
                state.updateMessageCounter(0x1235);

                let calculatedDiff;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "calculateDiff",
                    result => {
                        calculatedDiff = result.resolve;
                        return result;
                    },
                );
                let updateCalled = false;
                MockTime.interceptOnce(
                    // oxlint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    MessageReceptionStateUnencryptedWithRollover.prototype,
                    "updateMessageCounterAndBitmap",
                    result => {
                        updateCalled = true;
                        return result;
                    },
                );

                expect(() => state.updateMessageCounter(0x1234)).throws(DuplicateMessageError);
                expect(calculatedDiff).equal(-1);
                expect(updateCalled).equal(false);
            });

            it("value tests within counter window", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(96);
                assertMessageWindowUpdate(prototype, state, 100, 0b1000, false, 4);
                assertMessageWindowUpdate(prototype, state, 97, 0b1100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b11001, false, 1);
                assertMessageWindowUpdate(prototype, state, 103, 0b1100110, false, 2);
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                assertMessageWindowUpdate(prototype, state, 95, 0b11100110, false, -8);
                assertMessageWindowUpdate(prototype, state, 73, 0b100000000000000000000011100110, false, -30);
                assertMessageWindowUpdate(prototype, state, 72, 0b1100000000000000000000011100110, false, -31);
                assertMessageWindowUpdate(prototype, state, 71, 0b11100000000000000000000011100110, false, -32); // 32 bit reached
                // Verify some values within bitmap again
                expect(() => state.updateMessageCounter(96)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(101)).throws(DuplicateMessageError);
                expect(() => state.updateMessageCounter(103)).throws(DuplicateMessageError);
                state.updateMessageCounter(102);
            });

            it("value tests on counter window edges", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(103);
                assertMessageWindowUpdate(prototype, state, 100, 0b100, false, -3);
                assertMessageWindowUpdate(prototype, state, 101, 0b110, false, -2);
                assertMessageWindowUpdate(prototype, state, 96, 0b1000110, false, -7);

                assertMessageWindowUpdate(prototype, state, 71, 0b10000000000000000000000001000110, false, -32); // Lowest value in window, so this is not duplicate
            });

            it("value tests on edges and duplicate values with low max-number and rollovers", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(103);
                assertMessageWindowUpdate(prototype, state, 70, 0b0, false, MAX_COUNTER_VALUE_32BIT - 32); // outside window is always new and moves the window

                assertMessageWindowUpdate(prototype, state, 71, 0b1, false, 1);
                assertMessageWindowUpdate(prototype, state, 105, 0b0, false, 34);
                assertMessageWindowUpdate(prototype, state, 73, 0b10000000000000000000000000000000, false, -32); // new window edge
            });

            it("value tests on edges and duplicate values with high max-number and rollovers", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(Math.pow(2, 30));
                state.updateMessageCounter(10);

                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 10,
                    0b100000000000000000000,
                    false,
                    -21,
                );
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 21,
                    0b10000000000100000000000000000000,
                    false,
                    -32,
                ); // new window edge
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 22,
                    0b0,
                    false,
                    MAX_COUNTER_VALUE_32BIT - 32,
                ); // window moved
            });

            it("treats the exact counter rollover (MAX -> 0) as new and detects replays", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 1);
                state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT); // max = MAX

                // The counter rolls over to 0, which is one step ahead of MAX: new, and advances max.
                assertMessageWindowDifference(prototype, state, 0, false, 1);

                // 0 is now the maximum, so a replay of 0 is a duplicate.
                expect(() => state.updateMessageCounter(0)).throws(DuplicateMessageError);
                // MAX is one behind max=0 (within the window) and was already seen: duplicate.
                expect(() => state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT)).throws(DuplicateMessageError);

                // Counting continues forward past the rollover.
                assertMessageWindowDifference(prototype, state, 1, false, 1);
            });

            it("forward jump of exactly the window size clears stale bitmap bits", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 94, 0b100000, false, -6);
                assertMessageWindowUpdate(prototype, state, 132, 0b10000000000000000000000000000000, false, 32);
                assertMessageWindowUpdate(prototype, state, 126, 0b10000000000000000000000000100000, false, -6);
            });

            it("forward jump of window size - 1 keeps the oldest bit at the window edge", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 131, 0b11000000000000000000000000000000, false, 31);
                assertMessageWindowDifference(prototype, state, 99, true, -32);
                assertMessageWindowDifference(prototype, state, 100, true, -31);
                assertMessageWindowUpdate(prototype, state, 101, 0b11100000000000000000000000000000, false, -30);
            });

            it("forward jump of window size + 1 clears the whole window", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                state.updateMessageCounter(1);
                state.updateMessageCounter(100);
                assertMessageWindowUpdate(prototype, state, 99, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 133, 0b0, false, 33);
                assertMessageWindowUpdate(prototype, state, 101, 0b10000000000000000000000000000000, false, -32);
                // Behind the window: new for unencrypted messages, and rolls the window back
                assertMessageWindowUpdate(prototype, state, 100, 0b0, false, MAX_COUNTER_VALUE_32BIT - 32);
            });

            it("forward jumps of window size - 1, window size and window size + 1 across the 2^32 wrap", () => {
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                const start = () => {
                    const state = new MessageReceptionStateUnencryptedWithRollover();
                    state.updateMessageCounter(MAX_COUNTER_VALUE_32BIT - 5);
                    assertMessageWindowUpdate(prototype, state, MAX_COUNTER_VALUE_32BIT - 6, 0b1, false, -1);
                    return state;
                };

                let state = start();
                assertMessageWindowUpdate(prototype, state, 25, 0b11000000000000000000000000000000, false, 31);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 6, true, -32);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 5, true, -31);
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 4,
                    0b11100000000000000000000000000000,
                    false,
                    -30,
                );

                state = start();
                assertMessageWindowUpdate(prototype, state, 26, 0b10000000000000000000000000000000, false, 32);
                assertMessageWindowUpdate(prototype, state, 25, 0b10000000000000000000000000000001, false, -1);
                assertMessageWindowDifference(prototype, state, MAX_COUNTER_VALUE_32BIT - 5, true, -32);

                state = start();
                assertMessageWindowUpdate(prototype, state, 27, 0b0, false, 33);
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 4,
                    0b10000000000000000000000000000000,
                    false,
                    -32,
                );
                // Behind the window: new for unencrypted messages, and rolls the window back
                assertMessageWindowUpdate(
                    prototype,
                    state,
                    MAX_COUNTER_VALUE_32BIT - 5,
                    0b0,
                    false,
                    MAX_COUNTER_VALUE_32BIT - 32,
                );
            });

            it("accepts every counter in the window exactly once", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                state.updateMessageCounter(100);
                expectEachWindowCounterAcceptedOnce(state, 100);
            });

            it("accepts every counter in a window that spans the 2^32 wrap exactly once", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover();
                state.updateMessageCounter(10);
                expectEachWindowCounterAcceptedOnce(state, 10);
            });

            it("initial state with a non-zero max starts with an empty window", () => {
                const state = new MessageReceptionStateUnencryptedWithRollover(1000);
                const prototype = MessageReceptionStateUnencryptedWithRollover.prototype;
                expect(() => state.updateMessageCounter(1000)).throws(DuplicateMessageError);
                assertMessageWindowUpdate(prototype, state, 999, 0b1, false, -1);
                assertMessageWindowUpdate(prototype, state, 968, 0b10000000000000000000000000000001, false, -32);
                assertMessageWindowUpdate(prototype, state, 967, 0b0, false, MAX_COUNTER_VALUE_32BIT - 32);
            });

            it("accepts an in-window sub-max counter delivered right after the first counter", () => {
                // Reproduces issue #4095: a StandaloneAck (af) arrives before the earlier-numbered
                // PbkdfParamResponse (af-1). With an empty starting window the response is new, not a duplicate.
                const state = new MessageReceptionStateUnencryptedWithRollover();
                const af = 0x0e8288af;

                state.updateMessageCounter(af); // first observed counter anchors max
                expect(() => state.updateMessageCounter(af - 1)).not.throws(); // reordered response accepted
                expect(() => state.updateMessageCounter(af - 1)).throws(DuplicateMessageError); // genuine replay rejected
            });
        });
    });
});
