/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { p256 } from "@noble/curves/nist.js";
import { EcJpakePms } from "../src/dtls/ecjpake/EcJpakePms.js";
import {
    ECJPAKE_ID_CLIENT,
    ECJPAKE_ID_SERVER,
    type EcJpakeKeyKP,
    EcJpakeRound,
} from "../src/dtls/ecjpake/EcJpakeRound.js";
import { SchnorrZkp } from "../src/dtls/ecjpake/SchnorrZkp.js";
import { CHANGE_CIPHER_SPEC_BODY, ChangeCipherSpec } from "../src/dtls/handshake/ChangeCipherSpec.js";
import {
    CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8,
    EXTENSION_TYPE_ECJPAKE_KKPP,
} from "../src/dtls/handshake/ClientHelloMessage.js";
import { DtlsClient } from "../src/dtls/handshake/DtlsClient.js";
import { FinishedMessage } from "../src/dtls/handshake/FinishedMessage.js";
import { HandshakeMessage } from "../src/dtls/handshake/HandshakeMessage.js";
import { HandshakeType } from "../src/dtls/handshake/HandshakeType.js";
import { HandshakeTranscript } from "../src/dtls/prf/HandshakeTranscript.js";
import { TlsPrf } from "../src/dtls/prf/TlsPrf.js";
import { ContentType } from "../src/dtls/record/ContentType.js";
import { DtlsCipherState } from "../src/dtls/record/DtlsCipherState.js";
import { DtlsRecord } from "../src/dtls/record/DtlsRecord.js";

const N = p256.Point.Fn.ORDER;

interface InboundRecordView {
    type: ContentType;
    epoch: number;
    sequenceNumber: bigint;
    fragment: Uint8Array;
}

function bigintFromBE(bytes: Uint8Array): bigint {
    let v = 0n;
    for (const byte of bytes) {
        v = (v << 8n) | BigInt(byte);
    }
    return v;
}

function makeFixedRandom(byte: number): () => Uint8Array {
    return () => new Uint8Array(32).fill(byte);
}

/**
 * Deterministic ephemeral-scalar source. Returns scalars in [1, n-1] derived from
 * a 64-bit linear feedback over `seed`. NOT cryptographically secure — tests only.
 */
function makeScalarStream(seed: bigint): () => bigint {
    let state = seed;
    return () => {
        state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
        const v = (state | 1n) % N;
        return v === 0n ? 1n : v;
    };
}

/**
 * Mirror server that mirrors the client's primitives. Used as an oracle for
 * end-to-end tests; this is not byte-identical to mbedTLS — sub-batch 6 will
 * cover that.
 */
class MirrorServer {
    readonly #password: bigint;
    readonly #cookie: Uint8Array;
    readonly #scalars: () => bigint;
    readonly #serverRandom: Uint8Array;
    #transcript = new HandshakeTranscript();
    #handshakeMessageSeq = 0;
    #recordSeq = 0n;
    #clientRound1?: { kp1: EcJpakeKeyKP; kp2: EcJpakeKeyKP };
    #x4?: bigint;
    #X3?: Uint8Array;
    #X4?: Uint8Array;
    #clientRandom?: Uint8Array;
    #masterSecret?: Uint8Array;
    #cipherState?: DtlsCipherState;
    #expectingCookieEcho = true;
    #seenClientFinished = false;

    readonly #ignoreClientFinishedMismatch: boolean;

    constructor(args: {
        password: Uint8Array;
        cookie?: Uint8Array;
        serverRandomFill?: number;
        scalarSeed?: bigint;
        /**
         * When true the mirror server proceeds to emit its own Finished even if the client's
         * Finished MAC doesn't match — useful for testing the client-side detection of a bad
         * server-Finished (which is what happens when the password disagrees: both sides
         * derive different master secrets and neither MAC matches).
         */
        ignoreClientFinishedMismatch?: boolean;
    }) {
        this.#password = bigintFromBE(args.password);
        this.#cookie = args.cookie ?? Bytes.of(Bytes.fromHex("0a0b0c0d"));
        this.#scalars = makeScalarStream(args.scalarSeed ?? 0xc0ffeen);
        this.#serverRandom = new Uint8Array(32).fill(args.serverRandomFill ?? 0xb0);
        this.#ignoreClientFinishedMismatch = args.ignoreClientFinishedMismatch ?? false;
    }

    /** Process one client datagram, return the records to send back. */
    onClientDatagram(bytes: Uint8Array): Uint8Array[] {
        if (this.#expectingCookieEcho) {
            const records = this.#splitRecords(bytes);
            return this.#handleFirstOrSecondClientHello(records);
        }
        if (this.#seenClientFinished) {
            return [];
        }
        // The client flight contains an encrypted record (Finished at epoch 1) that we cannot
        // decrypt until we've armed the cipher state from the CKE; split lazily.
        return this.#handleClientFlightLazy(bytes);
    }

    isEstablished(): boolean {
        return this.#seenClientFinished;
    }

    cipherState(): DtlsCipherState {
        if (this.#cipherState === undefined) {
            throw new Error("MirrorServer not yet armed");
        }
        return this.#cipherState;
    }

    #splitRecords(bytes: Uint8Array): InboundRecordView[] {
        const out: InboundRecordView[] = [];
        let p = 0;
        while (p < bytes.length) {
            const { record, consumed } = DtlsRecord.decode(bytes.subarray(p), this.#cipherState);
            out.push(record);
            p += consumed;
        }
        return out;
    }

    #parseClientHello(body: Uint8Array): { random: Uint8Array; cookie: Uint8Array; ecjpakeKkpp: Uint8Array } {
        let p = 0;
        // version (2 bytes) — ignore here.
        p += 2;
        const random = body.slice(p, p + 32);
        p += 32;
        const sidLen = body[p++];
        p += sidLen;
        const cookieLen = body[p++];
        const cookie = body.slice(p, p + cookieLen);
        p += cookieLen;
        const csLen = (body[p] << 8) | body[p + 1];
        p += 2;
        // Validate cipher suites contain 0xC0FF.
        let foundSuite = false;
        for (let i = 0; i < csLen; i += 2) {
            const suite = (body[p + i] << 8) | body[p + i + 1];
            if (suite === CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8) {
                foundSuite = true;
            }
        }
        if (!foundSuite) {
            throw new Error("MirrorServer: ClientHello missing 0xC0FF cipher suite");
        }
        p += csLen;
        const compLen = body[p++];
        p += compLen;
        // extensions
        const extsLen = (body[p] << 8) | body[p + 1];
        p += 2;
        let ecjpakeKkpp: Uint8Array | undefined;
        const extsEnd = p + extsLen;
        while (p < extsEnd) {
            const extType = (body[p] << 8) | body[p + 1];
            p += 2;
            const extDataLen = (body[p] << 8) | body[p + 1];
            p += 2;
            if (extType === EXTENSION_TYPE_ECJPAKE_KKPP) {
                ecjpakeKkpp = body.slice(p, p + extDataLen);
            }
            p += extDataLen;
        }
        if (ecjpakeKkpp === undefined) {
            throw new Error("MirrorServer: ClientHello missing ecjpake_kkpp extension");
        }
        return { random, cookie, ecjpakeKkpp };
    }

    #handleFirstOrSecondClientHello(records: InboundRecordView[]): Uint8Array[] {
        if (records.length !== 1 || records[0].type !== ContentType.HANDSHAKE) {
            throw new Error("MirrorServer: expected single handshake record");
        }
        const { message } = HandshakeMessage.decode(records[0].fragment);
        if (message.msgType !== HandshakeType.CLIENT_HELLO) {
            throw new Error(`MirrorServer: expected ClientHello, got ${message.msgType}`);
        }
        const parsed = this.#parseClientHello(message.body);
        if (parsed.cookie.length === 0) {
            // Reply with HelloVerifyRequest.
            const hvrBody = new Uint8Array(2 + 1 + this.#cookie.length);
            hvrBody[0] = 0xfe;
            hvrBody[1] = 0xfd;
            hvrBody[2] = this.#cookie.length;
            hvrBody.set(this.#cookie, 3);
            const hvr = HandshakeMessage.encode({
                msgType: HandshakeType.HELLO_VERIFY_REQUEST,
                messageSeq: 0,
                body: hvrBody,
            });
            const rec = DtlsRecord.encode({
                type: ContentType.HANDSHAKE,
                epoch: 0,
                sequenceNumber: this.#recordSeq,
                fragment: hvr,
            });
            this.#recordSeq += 1n;
            return [rec];
        }
        // Second ClientHello with cookie — verify cookie matches.
        if (!Bytes.areEqual(parsed.cookie, this.#cookie)) {
            throw new Error("MirrorServer: ClientHello cookie mismatch");
        }
        // Mark the transcript-relevant ClientHello.
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.CLIENT_HELLO,
                messageSeq: message.messageSeq,
                body: message.body,
            }),
        );
        this.#expectingCookieEcho = false;
        this.#clientRandom = parsed.random;
        this.#clientRound1 = EcJpakeRound.parseRound1(parsed.ecjpakeKkpp);
        // Verify client's round-1 ZKPs against curve base.
        if (
            !SchnorrZkp.verify({
                zkp: this.#clientRound1.kp1.zkp,
                publicKey: this.#clientRound1.kp1.X,
                id: ECJPAKE_ID_CLIENT,
            })
        ) {
            throw new Error("MirrorServer: client KP1 ZKP failed");
        }
        if (
            !SchnorrZkp.verify({
                zkp: this.#clientRound1.kp2.zkp,
                publicKey: this.#clientRound1.kp2.X,
                id: ECJPAKE_ID_CLIENT,
            })
        ) {
            throw new Error("MirrorServer: client KP2 ZKP failed");
        }

        // Build server flight: ServerHello + ServerKeyExchange + ServerHelloDone.
        const x3 = this.#scalars();
        const x4 = this.#scalars();
        const v1 = this.#scalars();
        const v2 = this.#scalars();
        const serverRound1 = EcJpakeRound.buildRound1({
            x1: x3,
            x2: x4,
            v1,
            v2,
            id: ECJPAKE_ID_SERVER,
        });
        this.#x4 = x4;
        this.#X3 = serverRound1.kp1.X;
        this.#X4 = serverRound1.kp2.X;
        const serverRound1Bytes = EcJpakeRound.serializeRound1(serverRound1.kp1, serverRound1.kp2);

        // ServerHello body.
        const serverHelloBody = this.#buildServerHelloBody(serverRound1Bytes);
        const serverHelloMsgSeq = this.#handshakeMessageSeq++;
        const serverHelloHs = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_HELLO,
            messageSeq: serverHelloMsgSeq,
            body: serverHelloBody,
        });
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.SERVER_HELLO,
                messageSeq: serverHelloMsgSeq,
                body: serverHelloBody,
            }),
        );

        // ServerKeyExchange — server-perspective generator G' = X1 + X2 + X3.
        const serverGenerator = EcJpakeRound.composeRound2Generator({
            Xp1: this.#clientRound1.kp1.X,
            Xp2: this.#clientRound1.kp2.X,
            Xm1: this.#X3,
        });
        const v3 = this.#scalars();
        const serverRound2 = EcJpakeRound.buildRound2({
            xm2: x4,
            s: this.#password,
            v: v3,
            id: ECJPAKE_ID_SERVER,
            generator: serverGenerator,
        });
        const skeBody = EcJpakeRound.serializeRound2(serverRound2, { prependEcParameters: true });
        const skeMsgSeq = this.#handshakeMessageSeq++;
        const skeHs = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_KEY_EXCHANGE,
            messageSeq: skeMsgSeq,
            body: skeBody,
        });
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.SERVER_KEY_EXCHANGE,
                messageSeq: skeMsgSeq,
                body: skeBody,
            }),
        );

        const shdMsgSeq = this.#handshakeMessageSeq++;
        const shdHs = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_HELLO_DONE,
            messageSeq: shdMsgSeq,
            body: new Uint8Array(0),
        });
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.SERVER_HELLO_DONE,
                messageSeq: shdMsgSeq,
                body: new Uint8Array(0),
            }),
        );

        // Pack the three handshake messages into a single record.
        const flightBytes = new Uint8Array(serverHelloHs.length + skeHs.length + shdHs.length);
        flightBytes.set(serverHelloHs, 0);
        flightBytes.set(skeHs, serverHelloHs.length);
        flightBytes.set(shdHs, serverHelloHs.length + skeHs.length);

        const flightRecord = DtlsRecord.encode({
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: this.#recordSeq,
            fragment: flightBytes,
        });
        this.#recordSeq += 1n;
        return [flightRecord];
    }

    #buildServerHelloBody(ecjpakeKkpp: Uint8Array): Uint8Array {
        const extEntryLen = 2 + 2 + ecjpakeKkpp.length;
        const totalLen = 2 + 32 + 1 + 2 + 1 + 2 + extEntryLen;
        const out = new Uint8Array(totalLen);
        let p = 0;
        out[p++] = 0xfe;
        out[p++] = 0xfd;
        out.set(this.#serverRandom, p);
        p += 32;
        out[p++] = 0; // session_id length
        out[p++] = (CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 >>> 8) & 0xff;
        out[p++] = CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 & 0xff;
        out[p++] = 0; // null compression
        out[p++] = (extEntryLen >>> 8) & 0xff;
        out[p++] = extEntryLen & 0xff;
        out[p++] = (EXTENSION_TYPE_ECJPAKE_KKPP >>> 8) & 0xff;
        out[p++] = EXTENSION_TYPE_ECJPAKE_KKPP & 0xff;
        out[p++] = (ecjpakeKkpp.length >>> 8) & 0xff;
        out[p++] = ecjpakeKkpp.length & 0xff;
        out.set(ecjpakeKkpp, p);
        return out;
    }

    /**
     * Lazy walk over a datagram: read each record's header up-front (the 13-byte preamble +
     * length is plaintext regardless of epoch), arm the cipher state once we've parsed the
     * CKE + CCS, then decrypt the encrypted Finished record. This mirrors what a real DTLS
     * server has to do because it can never decrypt before key derivation.
     */
    #handleClientFlightLazy(bytes: Uint8Array): Uint8Array[] {
        let p = 0;
        let clientFinishedBody: Uint8Array | undefined;
        let clientFinishedMsgSeq = 0;
        let sawCcs = false;
        let sawCke = false;
        while (p < bytes.length) {
            // Peek at the record type/epoch/length without invoking AEAD.
            if (bytes.length - p < 13) {
                throw new Error("MirrorServer: short record header");
            }
            const epoch = (bytes[p + 3] << 8) | bytes[p + 4];
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + 13 + length;
            if (recordEnd > bytes.length) {
                throw new Error("MirrorServer: record length overruns datagram");
            }
            // Slice the single-record datagram so DtlsRecord.decode consumes exactly it.
            const recordBytes = bytes.subarray(p, recordEnd);
            const stateForDecode = epoch === 0 ? undefined : this.#cipherState;
            let record;
            try {
                record = DtlsRecord.decode(recordBytes, stateForDecode).record;
            } catch (e) {
                if (epoch >= 1 && this.#ignoreClientFinishedMismatch) {
                    // Wrong-password test path: server can't decrypt the client's Finished because
                    // the AEAD keys differ. Pretend we saw a (mismatching) Finished so we still
                    // emit our own — letting the client surface the failure on its end.
                    clientFinishedBody = new Uint8Array(12);
                    p = recordEnd;
                    continue;
                }
                throw e;
            }
            if (record.type === ContentType.HANDSHAKE && record.epoch === 0) {
                const { message } = HandshakeMessage.decode(record.fragment);
                if (message.msgType !== HandshakeType.CLIENT_KEY_EXCHANGE) {
                    throw new Error(`MirrorServer: expected CKE, got ${message.msgType}`);
                }
                sawCke = true;
                this.#transcript.appendHandshakeMessage(
                    HandshakeMessage.encodeForTranscript({
                        msgType: HandshakeType.CLIENT_KEY_EXCHANGE,
                        messageSeq: message.messageSeq,
                        body: message.body,
                    }),
                );
                this.#armCipherStateFromCke(message.body);
            } else if (record.type === ContentType.CHANGE_CIPHER_SPEC) {
                ChangeCipherSpec.parse(record.fragment);
                sawCcs = true;
            } else if (record.type === ContentType.HANDSHAKE && record.epoch >= 1) {
                if (!sawCke || !sawCcs) {
                    throw new Error("MirrorServer: encrypted handshake before CKE/CCS");
                }
                const { message } = HandshakeMessage.decode(record.fragment);
                if (message.msgType !== HandshakeType.FINISHED) {
                    throw new Error(`MirrorServer: expected Finished, got ${message.msgType}`);
                }
                clientFinishedBody = message.body;
                clientFinishedMsgSeq = message.messageSeq;
            }
            p = recordEnd;
        }
        if (!sawCke || !sawCcs || clientFinishedBody === undefined) {
            throw new Error("MirrorServer: client flight missing CKE/CCS/Finished");
        }
        const cipherState = this.#cipherState;
        const masterSecret = this.#masterSecret;
        if (cipherState === undefined || masterSecret === undefined) {
            throw new Error("MirrorServer: cipher state should have been armed by now");
        }
        // Verify client Finished against transcript-so-far (CH..SHD..CKE).
        const expected = TlsPrf.verifyData({
            masterSecret,
            role: "client",
            transcriptDigest: this.#transcript.digest(),
        });
        const actual = FinishedMessage.parse(clientFinishedBody).verifyData;
        if (!Bytes.areEqual(expected, actual) && !this.#ignoreClientFinishedMismatch) {
            throw new Error("MirrorServer: client Finished verify_data mismatch");
        }
        // Append client Finished body to transcript before computing server Finished.
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.FINISHED,
                messageSeq: clientFinishedMsgSeq,
                body: clientFinishedBody,
            }),
        );
        // Build server's CCS + Finished.
        const ccsRecord = DtlsRecord.encode({
            type: ContentType.CHANGE_CIPHER_SPEC,
            epoch: 0,
            sequenceNumber: this.#recordSeq,
            fragment: CHANGE_CIPHER_SPEC_BODY,
        });
        this.#recordSeq += 1n;
        cipherState.advanceWriteEpoch();
        const serverVerifyData = TlsPrf.verifyData({
            masterSecret,
            role: "server",
            transcriptDigest: this.#transcript.digest(),
        });
        const serverFinishedHs = HandshakeMessage.encode({
            msgType: HandshakeType.FINISHED,
            messageSeq: this.#handshakeMessageSeq++,
            body: FinishedMessage.build(serverVerifyData),
        });
        const finishedSeq = cipherState.nextWriteSeq();
        const finishedRecord = DtlsRecord.encode(
            {
                type: ContentType.HANDSHAKE,
                epoch: cipherState.writeEpoch,
                sequenceNumber: finishedSeq,
                fragment: serverFinishedHs,
            },
            cipherState,
        );
        this.#seenClientFinished = true;
        return [ccsRecord, finishedRecord];
    }

    #armCipherStateFromCke(ckeBody: Uint8Array): void {
        const X3 = this.#X3;
        const X4 = this.#X4;
        const clientRound1 = this.#clientRound1;
        const x4 = this.#x4;
        const clientRandom = this.#clientRandom;
        if (
            X3 === undefined ||
            X4 === undefined ||
            clientRound1 === undefined ||
            x4 === undefined ||
            clientRandom === undefined
        ) {
            throw new Error("MirrorServer: arming cipher state before second ClientHello was processed");
        }
        const clientRound2 = EcJpakeRound.parseRound2(ckeBody, { expectEcParameters: false });
        const clientGenerator = EcJpakeRound.composeRound2Generator({
            Xp1: X3,
            Xp2: X4,
            Xm1: clientRound1.kp1.X,
        });
        if (
            !EcJpakeRound.verifyRound2Zkp({
                kp: clientRound2,
                generator: clientGenerator,
                peerId: ECJPAKE_ID_CLIENT,
            })
        ) {
            throw new Error("MirrorServer: client round-2 ZKP failed");
        }
        // PMS from server's perspective: Xp = client's Xm, Xp2 = client's X2, xm2 = server's x4, s = password.
        const pms = EcJpakePms.derive({
            Xp: clientRound2.X,
            Xp2: clientRound1.kp2.X,
            xm2: x4,
            s: this.#password,
        });
        this.#masterSecret = TlsPrf.masterSecret({
            premasterSecret: pms,
            clientRandom,
            serverRandom: this.#serverRandom,
        });
        const keyBlock = TlsPrf.keyBlock({
            masterSecret: this.#masterSecret,
            clientRandom,
            serverRandom: this.#serverRandom,
        });
        this.#cipherState = new DtlsCipherState("server", {
            clientWriteKey: keyBlock.clientWriteKey,
            serverWriteKey: keyBlock.serverWriteKey,
            clientWriteSalt: keyBlock.clientWriteIv,
            serverWriteSalt: keyBlock.serverWriteIv,
        });
        // Server's read-side will see encrypted Finished at epoch 1 — bump the read epoch
        // now to mirror the CCS we received.
        this.#cipherState.advanceReadEpoch();
    }
}

/**
 * Wire two parties together: feed the client's records to the mirror server,
 * feed the server's response back into the client. Returns once the client
 * reports "established".
 */
function runHandshake(client: DtlsClient, server: MirrorServer): { steps: number } {
    const concat = (records: Uint8Array[]) => {
        const total = records.reduce((a, r) => a + r.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const r of records) {
            out.set(r, off);
            off += r.length;
        }
        return out;
    };
    let { records } = client.start();
    let steps = 0;
    while (!client.isEstablished()) {
        steps += 1;
        if (steps > 10) {
            throw new Error("handshake did not converge");
        }
        const datagram = concat(records);
        const reply = server.onClientDatagram(datagram);
        if (reply.length === 0) {
            break;
        }
        const replyDatagram = concat(reply);
        const next = client.onDatagram(replyDatagram);
        records = next.records;
    }
    return { steps };
}

const DEFAULT_PASSWORD = Bytes.of(Bytes.fromHex("4a3070000000000a"));

describe("DtlsClient — happy-path handshake (mirror server)", () => {
    it("completes a cookie-exchange handshake to 'established'", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xa1),
            ephemeralScalar: makeScalarStream(0x1234567890abcdefn),
        });
        const server = new MirrorServer({
            password: DEFAULT_PASSWORD,
            cookie: Bytes.of(Bytes.fromHex("aa55cc33")),
            scalarSeed: 0xfeedfacecafebaben,
        });
        runHandshake(client, server);
        expect(client.state()).to.equal("established");
        expect(client.isEstablished()).to.equal(true);
        expect(client.cipherState().writeEpoch).to.equal(1);
        expect(server.isEstablished()).to.equal(true);
    });

    it("'state()' transitions in the documented order through the cookie path", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xa2),
            ephemeralScalar: makeScalarStream(0x99n),
        });
        const server = new MirrorServer({
            password: DEFAULT_PASSWORD,
            scalarSeed: 0x42n,
        });
        const concat = (rs: Uint8Array[]) => {
            const t = rs.reduce((a, r) => a + r.length, 0);
            const o = new Uint8Array(t);
            let p = 0;
            for (const r of rs) {
                o.set(r, p);
                p += r.length;
            }
            return o;
        };
        expect(client.state()).to.equal("initial");
        const start = client.start();
        expect(client.state()).to.equal("sent_first_clienthello");
        const r1 = server.onClientDatagram(concat(start.records));
        const step2 = client.onDatagram(concat(r1));
        expect(client.state()).to.equal("sent_clienthello_with_cookie");
        const r2 = server.onClientDatagram(concat(step2.records));
        const step3 = client.onDatagram(concat(r2));
        expect(client.state()).to.equal("sent_clientkeyexchange_flight");
        const r3 = server.onClientDatagram(concat(step3.records));
        client.onDatagram(concat(r3));
        expect(client.state()).to.equal("established");
    });
});

describe("DtlsClient — failure paths", () => {
    it("transitions to 'failed' when the server's round-1 ZKP is corrupt", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0x10),
            ephemeralScalar: makeScalarStream(0x1n),
        });
        const server = new MirrorServer({ password: DEFAULT_PASSWORD });
        const concat = (rs: Uint8Array[]) => {
            const t = rs.reduce((a, r) => a + r.length, 0);
            const o = new Uint8Array(t);
            let p = 0;
            for (const r of rs) {
                o.set(r, p);
                p += r.length;
            }
            return o;
        };
        const start = client.start();
        const r1 = concat(server.onClientDatagram(concat(start.records)));
        const step2 = client.onDatagram(r1);
        const reply = concat(server.onClientDatagram(concat(step2.records)));
        // Tamper the server flight: flip a bit deep inside the ServerHello extension data.
        // We pick an offset well past the headers (around 200 bytes in — inside the
        // ZKP V coordinate of the first server KP).
        const tampered = Uint8Array.from(reply);
        tampered[200] ^= 0x01;
        expect(() => client.onDatagram(tampered)).to.throw();
        expect(client.state()).to.equal("failed");
    });

    it("transitions to 'failed' when client and server use different passwords (server Finished MAC mismatch)", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0x20),
            ephemeralScalar: makeScalarStream(0xabcdn),
        });
        // ignoreClientFinishedMismatch=true makes the mirror server emit its (mismatching)
        // Finished anyway, so the failure mode the test is exercising is the client-side
        // server-Finished verification — exactly what RFC 5246 §7.4.9 says must reject the
        // peer when the master secret disagrees.
        const server = new MirrorServer({
            password: Bytes.of(Bytes.fromHex("ffffffffffffffff")),
            scalarSeed: 0x55n,
            ignoreClientFinishedMismatch: true,
        });
        // With different passwords: master_secret + AES keys differ. The first failure the
        // client hits is the AEAD tag check on the encrypted server Finished record (the AES
        // key the server used to seal it differs from the one the client derives). If keys
        // happened to align, the verify_data MAC check would catch it instead.
        expect(() => runHandshake(client, server)).to.throw();
        expect(client.state()).to.equal("failed");
    });
});

describe("DtlsClient — retransmit", () => {
    it("re-emits the last flight bytes-identically when onRetransmit() is called", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0x30),
            ephemeralScalar: makeScalarStream(0xfeedn),
        });
        const first = client.start();
        const re1 = client.onRetransmit();
        expect(re1.records.length).to.equal(first.records.length);
        for (let i = 0; i < first.records.length; i++) {
            expect(Bytes.areEqual(first.records[i], re1.records[i])).to.equal(true);
        }
        // After the cookie exchange the retransmit should re-emit the second ClientHello.
        const server = new MirrorServer({ password: DEFAULT_PASSWORD });
        const concat = (rs: Uint8Array[]) => {
            const t = rs.reduce((a, r) => a + r.length, 0);
            const o = new Uint8Array(t);
            let p = 0;
            for (const r of rs) {
                o.set(r, p);
                p += r.length;
            }
            return o;
        };
        const reply = concat(server.onClientDatagram(concat(first.records)));
        const second = client.onDatagram(reply);
        const re2 = client.onRetransmit();
        expect(re2.records.length).to.equal(second.records.length);
        for (let i = 0; i < second.records.length; i++) {
            expect(Bytes.areEqual(second.records[i], re2.records[i])).to.equal(true);
        }
    });
});

describe("DtlsClient — multi-record datagram", () => {
    it("accepts ServerHello + SKE + SHD packed into a single datagram", () => {
        // The MirrorServer already packs the three messages into one record/datagram by default;
        // this test asserts that the client splits them correctly.
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xb0),
            ephemeralScalar: makeScalarStream(0xbeefn),
        });
        const server = new MirrorServer({ password: DEFAULT_PASSWORD });
        runHandshake(client, server);
        expect(client.isEstablished()).to.equal(true);
    });
});

describe("DtlsClient — pre/post-state guards", () => {
    it("throws if start() is called twice", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xc0),
            ephemeralScalar: makeScalarStream(0x1n),
        });
        client.start();
        expect(() => client.start()).to.throw();
    });

    it("throws if cipherState() is called before 'established'", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xc1),
            ephemeralScalar: makeScalarStream(0x1n),
        });
        expect(() => client.cipherState()).to.throw(/established/);
    });

    it("throws if onDatagram() is called before start()", () => {
        const client = new DtlsClient({
            password: DEFAULT_PASSWORD,
            random: makeFixedRandom(0xc2),
            ephemeralScalar: makeScalarStream(0x1n),
        });
        expect(() => client.onDatagram(new Uint8Array(0))).to.throw();
    });
});
