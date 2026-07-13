/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Millis, Time } from "@matter/general";
import { BasicTlv, MeshCopTlvType } from "@matter/protocol";
import type { CoapClient } from "../src/coap/CoapClient.js";
import type { CoapMessage } from "../src/coap/CoapMessage.js";
import {
    Commissioner,
    CommissionerKeepAliveError,
    CommissionerRejectedError,
    CommissionerTimeoutError,
} from "../src/commissioner/Commissioner.js";

// Thread spec Table 8-35: STATE TLV byte values.
const STATE_ACCEPT = 0x01;
const STATE_REJECT = 0xff;
const STATE_PENDING = 0x00;

function buildPetitionResponse(state: number, sessionId?: number): Uint8Array {
    const entries = new Array<{ type: number; value: Uint8Array }>();
    entries.push({ type: MeshCopTlvType.STATE, value: new Uint8Array([state]) });
    if (sessionId !== undefined) {
        entries.push({
            type: MeshCopTlvType.COMMISSIONER_SESSION_ID,
            value: new Uint8Array([(sessionId >> 8) & 0xff, sessionId & 0xff]),
        });
    }
    return Bytes.of(BasicTlv.encode(entries));
}

function buildKaResponse(state: number): Uint8Array {
    return Bytes.of(BasicTlv.encode([{ type: MeshCopTlvType.STATE, value: new Uint8Array([state]) }]));
}

function ackMessage(payload: Uint8Array): CoapMessage {
    return { type: "ACK", code: "2.04", messageId: 0, token: new Uint8Array(4), payload };
}

function makeQueuedCoap(queue: Array<CoapMessage | Error>): CoapClient {
    const requestLog = new Array<{ uriPath: string[]; payload: Uint8Array }>();
    return {
        requestLog,
        request: async (opts: { uriPath: string[]; payload?: Uint8Array }) => {
            requestLog.push({ uriPath: opts.uriPath, payload: opts.payload ?? new Uint8Array() });
            const next = queue.shift();
            if (next === undefined) throw new Error("mock CoapClient: no more queued responses");
            if (next instanceof Error) throw next;
            return next;
        },
        close: async () => {},
    } as unknown as CoapClient;
}

describe("Commissioner", () => {
    describe("petition", () => {
        before(MockTime.enable);

        it("resolves with sessionId on accept response", async () => {
            const queue: Array<CoapMessage | Error> = [ackMessage(buildPetitionResponse(STATE_ACCEPT, 42))];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            expect(await commissioner.petition()).to.equal(42);
        });

        it("throws CommissionerRejectedError on reject", async () => {
            const queue: Array<CoapMessage | Error> = [ackMessage(buildPetitionResponse(STATE_REJECT))];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            try {
                await commissioner.petition();
                expect.fail("expected CommissionerRejectedError");
            } catch (err) {
                expect(err).to.be.instanceOf(CommissionerRejectedError);
            }
        });

        it("retries after pending and succeeds on second attempt", async () => {
            const queue: Array<CoapMessage | Error> = [
                ackMessage(buildPetitionResponse(STATE_PENDING)),
                ackMessage(buildPetitionResponse(STATE_ACCEPT, 99)),
            ];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            const p = commissioner.petition();
            await MockTime.yield();
            await MockTime.advance(0);
            const sessionId = await p;
            expect(sessionId).to.equal(99);
        });

        it("throws CommissionerRejectedError when retry returns reject", async () => {
            const queue: Array<CoapMessage | Error> = [
                ackMessage(buildPetitionResponse(STATE_PENDING)),
                ackMessage(buildPetitionResponse(STATE_REJECT)),
            ];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            const p = commissioner.petition();
            await MockTime.yield();
            await MockTime.advance(0);
            try {
                await p;
                expect.fail("expected CommissionerRejectedError");
            } catch (err) {
                expect(err).to.be.instanceOf(CommissionerRejectedError);
            }
        });

        it("throws CommissionerTimeoutError when still pending after retry", async () => {
            const queue: Array<CoapMessage | Error> = [
                ackMessage(buildPetitionResponse(STATE_PENDING)),
                ackMessage(buildPetitionResponse(STATE_PENDING)),
            ];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            const p = commissioner.petition();
            await MockTime.yield();
            await MockTime.advance(0);
            try {
                await p;
                expect.fail("expected CommissionerTimeoutError");
            } catch (err) {
                expect(err).to.be.instanceOf(CommissionerTimeoutError);
            }
        });
    });

    describe("withSession", () => {
        before(MockTime.enable);

        it("calls petition then fn then release in order", async () => {
            const order = new Array<string>();

            class TrackedCommissioner extends Commissioner {
                override async petition(): Promise<number> {
                    order.push("petition");
                    return 7;
                }
                override async release(_sessionId: number): Promise<void> {
                    order.push("release");
                }
            }

            const result = await new TrackedCommissioner({} as CoapClient).withSession(async sid => {
                order.push(`fn(${sid})`);
                return "ok";
            });

            expect(result).to.equal("ok");
            expect(order[0]).to.equal("petition");
            expect(order[1]).to.equal("fn(7)");
            expect(order[order.length - 1]).to.equal("release");
        });

        it("releases even when fn throws", async () => {
            let released = false;

            class TrackedCommissioner extends Commissioner {
                override async petition(): Promise<number> {
                    return 7;
                }
                override async release(_sessionId: number): Promise<void> {
                    released = true;
                }
            }

            try {
                await new TrackedCommissioner({} as CoapClient).withSession(async () => {
                    throw new Error("fn error");
                });
                expect.fail("should have thrown");
            } catch (err) {
                expect((err as Error).message).to.equal("fn error");
            }

            expect(released).to.equal(true);
        });

        it("keep-alive fires during the session", async () => {
            let kaCount = 0;
            const KA_INTERVAL_FOR_TEST = 20;

            class FastKaCommissioner extends Commissioner {
                override async petition(): Promise<number> {
                    return 5;
                }
                override async keepAlive(_sessionId: number): Promise<void> {
                    kaCount++;
                }
                override async release(_sessionId: number): Promise<void> {}

                override async withSession<T>(fn: (sessionId: number) => Promise<T>): Promise<T> {
                    const sessionId = await this.petition();
                    const kaInterval = Time.getPeriodicTimer(
                        "commissioner-keepalive-test",
                        Millis(KA_INTERVAL_FOR_TEST),
                        () => {
                            void this.keepAlive(sessionId);
                        },
                    ).start();
                    try {
                        return await fn(sessionId);
                    } finally {
                        kaInterval.stop();
                        await this.release(sessionId);
                    }
                }
            }

            const sessionDurationMs = KA_INTERVAL_FOR_TEST * 3 + Math.floor(KA_INTERVAL_FOR_TEST / 2);
            const sessionPromise = new FastKaCommissioner({} as CoapClient).withSession(async () => {
                await MockTime.advance(sessionDurationMs);
            });

            await sessionPromise;

            expect(kaCount).to.be.greaterThanOrEqual(2);
        });
    });

    describe("keepAlive", () => {
        it("posts to c/ca with the session ID as COMMISSIONER_SESSION_ID TLV", async () => {
            let capturedUriPath: string[] | undefined;
            let capturedPayload: Uint8Array | undefined;

            const mockCoap = {
                request: async (opts: { uriPath: string[]; payload?: Uint8Array }) => {
                    capturedUriPath = opts.uriPath;
                    capturedPayload = opts.payload;
                    return ackMessage(buildKaResponse(STATE_ACCEPT));
                },
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).keepAlive(42);

            expect(capturedUriPath).to.deep.equal(["c", "ca"]);
            expect(capturedPayload).to.not.be.undefined;
            const entries = BasicTlv.walk(capturedPayload!);
            const stateEntry = entries.find(e => e.type === MeshCopTlvType.STATE);
            expect(stateEntry).to.not.be.undefined;
            expect(Bytes.of(stateEntry!.value)[0]).to.equal(STATE_ACCEPT);
            const sidEntry = entries.find(e => e.type === MeshCopTlvType.COMMISSIONER_SESSION_ID);
            expect(sidEntry).to.not.be.undefined;
            const sidValue = Bytes.of(sidEntry!.value);
            expect((sidValue[0] << 8) | sidValue[1]).to.equal(42);
        });

        it("throws CommissionerKeepAliveError on a non-accept response", async () => {
            const mockCoap = {
                request: async () => ackMessage(buildKaResponse(STATE_REJECT)),
                close: async () => {},
            } as unknown as CoapClient;

            try {
                await new Commissioner(mockCoap).keepAlive(42);
                expect.fail("expected CommissionerKeepAliveError");
            } catch (err) {
                expect(err).to.be.instanceOf(CommissionerKeepAliveError);
            }
        });
    });

    describe("release", () => {
        it("resigns via c/ca keep-alive carrying State(reject) and the session ID", async () => {
            let capturedUriPath: string[] | undefined;
            let capturedPayload: Uint8Array | undefined;

            const mockCoap = {
                request: async (opts: { uriPath: string[]; payload?: Uint8Array }) => {
                    capturedUriPath = opts.uriPath;
                    capturedPayload = opts.payload;
                    return ackMessage(new Uint8Array());
                },
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).release(42);

            expect(capturedUriPath).to.deep.equal(["c", "ca"]);
            expect(capturedPayload).to.not.be.undefined;
            const entries = BasicTlv.walk(capturedPayload!);
            const stateEntry = entries.find(e => e.type === MeshCopTlvType.STATE);
            const sidEntry = entries.find(e => e.type === MeshCopTlvType.COMMISSIONER_SESSION_ID);
            expect(stateEntry).to.not.be.undefined;
            expect(Bytes.of(stateEntry!.value)[0]).to.equal(STATE_REJECT);
            expect(sidEntry).to.not.be.undefined;
            const sidValue = Bytes.of(sidEntry!.value);
            expect((sidValue[0] << 8) | sidValue[1]).to.equal(42);
        });

        it("swallows CoAP errors (best-effort)", async () => {
            const mockCoap = {
                request: async () => {
                    throw new Error("coap boom");
                },
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).release(42);
        });

        it("tolerates a non-success CoAP response without throwing (best-effort)", async () => {
            const mockCoap = {
                request: async () =>
                    ({
                        type: "ACK",
                        code: "4.04",
                        messageId: 0,
                        token: new Uint8Array(4),
                        payload: new Uint8Array(),
                    }) as CoapMessage,
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).release(42);
        });
    });

    describe("error classes", () => {
        it("CommissionerRejectedError has correct name and inherits Error", () => {
            const err = new CommissionerRejectedError();
            expect(err).to.be.instanceOf(Error);
            expect(err).to.be.instanceOf(CommissionerRejectedError);
            expect(err.name).to.equal("CommissionerRejectedError");
        });

        it("CommissionerTimeoutError has correct name and inherits Error", () => {
            const err = new CommissionerTimeoutError();
            expect(err).to.be.instanceOf(Error);
            expect(err).to.be.instanceOf(CommissionerTimeoutError);
            expect(err.name).to.equal("CommissionerTimeoutError");
        });

        it("CommissionerKeepAliveError inherits Error", () => {
            const err = new CommissionerKeepAliveError("boom");
            expect(err).to.be.instanceOf(Error);
            expect(err).to.be.instanceOf(CommissionerKeepAliveError);
            expect(err.message).to.equal("boom");
        });
    });
});
