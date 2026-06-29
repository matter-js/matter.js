/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoapClient } from "../src/coap/CoapClient.js";
import type { CoapMessage } from "../src/coap/CoapMessage.js";
import { Commissioner, CommissionerRejectedError, CommissionerTimeoutError } from "../src/commissioner/Commissioner.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

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
    return BasicTlv.encode(entries);
}

function buildKaResponse(state: number): Uint8Array {
    return BasicTlv.encode([{ type: MeshCopTlvType.STATE, value: new Uint8Array([state]) }]);
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
            const sessionId = await commissioner.petition();
            expect(sessionId).to.equal(99);
        });

        it("throws CommissionerRejectedError when retry returns reject", async () => {
            const queue: Array<CoapMessage | Error> = [
                ackMessage(buildPetitionResponse(STATE_PENDING)),
                ackMessage(buildPetitionResponse(STATE_REJECT)),
            ];
            const coap = makeQueuedCoap(queue);
            const commissioner = new Commissioner(coap, { pendingRetryDelayMs: 0 });
            try {
                await commissioner.petition();
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
            try {
                await commissioner.petition();
                expect.fail("expected CommissionerTimeoutError");
            } catch (err) {
                expect(err).to.be.instanceOf(CommissionerTimeoutError);
            }
        });
    });

    describe("withSession", () => {
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

            class FastKaCommissioner extends Commissioner {
                static readonly KA_INTERVAL_FOR_TEST = 20;

                override async petition(): Promise<number> {
                    return 5;
                }
                override async keepAlive(_sessionId: number): Promise<void> {
                    kaCount++;
                }
                override async release(_sessionId: number): Promise<void> {}

                override async withSession<T>(fn: (sessionId: number) => Promise<T>): Promise<T> {
                    const sessionId = await this.petition();
                    const kaInterval = setInterval(() => {
                        void this.keepAlive(sessionId);
                    }, FastKaCommissioner.KA_INTERVAL_FOR_TEST);
                    try {
                        return await fn(sessionId);
                    } finally {
                        clearInterval(kaInterval);
                        await this.release(sessionId);
                    }
                }
            }

            await new FastKaCommissioner({} as CoapClient).withSession(
                async () =>
                    new Promise<void>(r =>
                        setTimeout(
                            r,
                            FastKaCommissioner.KA_INTERVAL_FOR_TEST * 3 + FastKaCommissioner.KA_INTERVAL_FOR_TEST / 2,
                        ),
                    ),
            );

            expect(kaCount).to.be.greaterThanOrEqual(2);
        });
    });

    describe("keepAlive", () => {
        it("passes session ID as COMMISSIONER_SESSION_ID TLV", async () => {
            let capturedPayload: Uint8Array | undefined;

            const mockCoap = {
                request: async (opts: { uriPath: string[]; payload?: Uint8Array }) => {
                    capturedPayload = opts.payload;
                    return ackMessage(buildKaResponse(STATE_ACCEPT));
                },
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).keepAlive(42);

            expect(capturedPayload).to.not.be.undefined;
            const entries = BasicTlv.walk(capturedPayload!);
            const sidEntry = entries.find(e => e.type === MeshCopTlvType.COMMISSIONER_SESSION_ID);
            expect(sidEntry).to.not.be.undefined;
            expect((sidEntry!.value[0] << 8) | sidEntry!.value[1]).to.equal(42);
        });
    });

    describe("release", () => {
        it("includes both COMMISSIONER_SESSION_ID and COMMISSIONER_ID in payload", async () => {
            let capturedPayload: Uint8Array | undefined;

            const mockCoap = {
                request: async (opts: { uriPath: string[]; payload?: Uint8Array }) => {
                    capturedPayload = opts.payload;
                    return ackMessage(new Uint8Array());
                },
                close: async () => {},
            } as unknown as CoapClient;

            await new Commissioner(mockCoap).release(42);

            expect(capturedPayload).to.not.be.undefined;
            const entries = BasicTlv.walk(capturedPayload!);
            const sidEntry = entries.find(e => e.type === MeshCopTlvType.COMMISSIONER_SESSION_ID);
            const idEntry = entries.find(e => e.type === MeshCopTlvType.COMMISSIONER_ID);
            expect(sidEntry).to.not.be.undefined;
            expect(idEntry).to.not.be.undefined;
            expect((sidEntry!.value[0] << 8) | sidEntry!.value[1]).to.equal(42);
            expect(new TextDecoder().decode(idEntry!.value)).to.equal(Commissioner.COMMISSIONER_ID);
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
    });
});
