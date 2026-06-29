/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcJpakePms } from "../ecjpake/EcJpakePms.js";
import { ECJPAKE_ID_CLIENT, ECJPAKE_ID_SERVER, EcJpakeRound } from "../ecjpake/EcJpakeRound.js";
import { SchnorrZkp } from "../ecjpake/SchnorrZkp.js";
import { HandshakeTranscript } from "../prf/HandshakeTranscript.js";
import { TlsPrf } from "../prf/TlsPrf.js";
import { ContentType } from "../record/ContentType.js";
import { DtlsCipherState } from "../record/DtlsCipherState.js";
import { DtlsRecord } from "../record/DtlsRecord.js";
import { CHANGE_CIPHER_SPEC_BODY, ChangeCipherSpec } from "./ChangeCipherSpec.js";
import { ClientHelloMessage } from "./ClientHelloMessage.js";
import { ClientKeyExchangeMessage } from "./ClientKeyExchangeMessage.js";
import { FINISHED_VERIFY_DATA_LEN, FinishedMessage } from "./FinishedMessage.js";
import { HandshakeMessage } from "./HandshakeMessage.js";
import { HandshakeType } from "./HandshakeType.js";
import { HelloVerifyRequestMessage } from "./HelloVerifyRequestMessage.js";
import { ServerHelloDoneMessage } from "./ServerHelloDoneMessage.js";
import { ServerHelloMessage } from "./ServerHelloMessage.js";
import { ServerKeyExchangeMessage } from "./ServerKeyExchangeMessage.js";

/**
 * DTLS 1.2 client-side handshake state machine for
 * `TLS_ECJPAKE_WITH_AES_128_CCM_8` (RFC 6347, RFC 5246, RFC 6655,
 * draft-cragie-tls-ecjpake-01).
 *
 * In scope (Phase 3 sub-batch 3): transport-agnostic flight assembly,
 * cookie exchange, transcript + key derivation, Finished verification,
 * retransmit emission. Out of scope: UDP socket binding (sub-batch 5),
 * server-side state machine, application-data flow.
 *
 * Transcript reset on cookie exchange — RFC 6347 §4.2.6 says the FIRST
 * ClientHello and HelloVerifyRequest are NOT in the transcript; the
 * transcript begins with the SECOND ClientHello (also mbedTLS's behaviour,
 * `library/ssl_msg.c` reset on `mbedtls_ssl_reset_checksum`).
 */

/** Discriminated states the client traverses during the handshake. */
export type DtlsClientState =
    | "initial"
    | "sent_first_clienthello"
    | "sent_clienthello_with_cookie"
    | "received_serverhello_flight"
    | "sent_clientkeyexchange_flight"
    | "established"
    | "failed";

export interface DtlsClientConfig {
    /** EC-JPAKE password (PSKc bytes for Thread). Hashed by mbedTLS as the integer of these bytes. */
    password: Uint8Array;
    /** Returns 32 bytes for `ClientHello.random`. Production: CSPRNG. */
    random: () => Uint8Array;
    /**
     * Returns a fresh scalar in [1, n-1]. Called five times per attempt:
     * x1, x2 (round-1 private keys), v1, v2 (round-1 ZKP ephemerals), v3 (round-2 ZKP ephemeral).
     */
    ephemeralScalar: () => bigint;
    /** Initial retransmit timeout in ms (RFC 6347 §4.2.4). Default 1000. */
    initialRetransmitMs?: number;
    /** Retransmit cap in ms (RFC 6347 §4.2.4 — exponential doubling, capped). Default 60000. */
    maxRetransmitMs?: number;
    /** Path MTU advisory (not enforced — flights are below 1280 in practice). */
    mtu?: number;
}

export interface DtlsClientStep {
    /** Records to emit on the wire (already framed as DTLS records). */
    records: Uint8Array[];
}

const RANDOM_LEN = 32;

interface InboundRecord {
    type: ContentType;
    epoch: number;
    sequenceNumber: bigint;
    fragment: Uint8Array;
}

interface InboundHandshake {
    msgType: HandshakeType;
    body: Uint8Array;
    /** TLS-form bytes for transcript hashing. */
    transcriptBytes: Uint8Array;
}

function bigintFromBE(bytes: Uint8Array): bigint {
    let v = 0n;
    for (const byte of bytes) {
        v = (v << 8n) | BigInt(byte);
    }
    return v;
}

export class DtlsClient {
    readonly #config: DtlsClientConfig;

    #state: DtlsClientState = "initial";
    #transcript = new HandshakeTranscript();
    #handshakeMessageSeq = 0;
    #recordSeq = 0n;
    #lastFlight = new Array<Uint8Array>();

    #x2!: bigint;
    #X1!: Uint8Array;
    #X2!: Uint8Array;
    /** Round-1 wire bytes — bytes-identical across cookie-exchange retries (mbedTLS `ecjpake_cache`). */
    #round1Bytes!: Uint8Array;

    /** 32-byte ClientHello.random — bytes-identical across cookie retries. */
    #clientRandom!: Uint8Array;

    #X3?: Uint8Array;
    #X4?: Uint8Array;
    #serverRandom?: Uint8Array;

    #masterSecret?: Uint8Array;
    #cipherState?: DtlsCipherState;

    constructor(config: DtlsClientConfig) {
        this.#config = config;
    }

    state(): DtlsClientState {
        return this.#state;
    }

    isEstablished(): boolean {
        return this.#state === "established";
    }

    cipherState(): DtlsCipherState {
        if (!this.isEstablished() || this.#cipherState === undefined) {
            throw new Error(`DtlsClient.cipherState() called in state '${this.#state}' (need 'established')`);
        }
        return this.#cipherState;
    }

    /** Initial flight: ClientHello with empty cookie. */
    start(): DtlsClientStep {
        if (this.#state !== "initial") {
            throw new Error(`DtlsClient.start() called in state '${this.#state}'`);
        }
        const random = this.#config.random();
        if (random.length !== RANDOM_LEN) {
            throw new Error(`DtlsClient config.random() returned ${random.length} bytes, need ${RANDOM_LEN}`);
        }
        this.#clientRandom = random;
        const x1 = this.#config.ephemeralScalar();
        const x2 = this.#config.ephemeralScalar();
        const v1 = this.#config.ephemeralScalar();
        const v2 = this.#config.ephemeralScalar();
        const round1 = EcJpakeRound.buildRound1({ x1, x2, v1, v2, id: ECJPAKE_ID_CLIENT });
        this.#x2 = x2;
        this.#X1 = round1.kp1.X;
        this.#X2 = round1.kp2.X;
        this.#round1Bytes = EcJpakeRound.serializeRound1(round1.kp1, round1.kp2);

        const records = this.#emitClientHello(new Uint8Array(0), false);
        this.#state = "sent_first_clienthello";
        return { records };
    }

    /** Re-emit the last flight bytes-identically (RFC 6347 §4.2.4). */
    onRetransmit(): DtlsClientStep {
        if (this.#state === "initial" || this.#state === "established" || this.#state === "failed") {
            throw new Error(`DtlsClient.onRetransmit() called in state '${this.#state}'`);
        }
        return { records: this.#lastFlight.map(r => r.slice()) };
    }

    onDatagram(bytes: Uint8Array): DtlsClientStep {
        if (this.#state === "established" || this.#state === "failed" || this.#state === "initial") {
            throw new Error(`DtlsClient.onDatagram() called in state '${this.#state}'`);
        }
        try {
            switch (this.#state) {
                case "sent_first_clienthello":
                    return this.#handleHelloVerifyOrServerHello(this.#splitDatagramIntoRecords(bytes));
                case "sent_clienthello_with_cookie":
                    return this.#handleServerHelloFlight(this.#splitDatagramIntoRecords(bytes));
                case "sent_clientkeyexchange_flight":
                    // Cannot eagerly split this datagram — the encrypted Finished record is at
                    // epoch 1 and needs the CCS earlier in the same datagram to bump the read
                    // epoch first. Walk the record envelopes lazily so CCS arrives before the
                    // AEAD decrypt is attempted.
                    return this.#handleServerFinishedFlightLazy(bytes);
                default:
                    throw new Error(`DtlsClient: state ${this.#state} cannot consume a datagram`);
            }
        } catch (e) {
            this.#state = "failed";
            throw e;
        }
    }

    // -----------------------------------------------------------------------
    // Datagram / record splitting

    #splitDatagramIntoRecords(bytes: Uint8Array): InboundRecord[] {
        const out = new Array<InboundRecord>();
        let p = 0;
        while (p < bytes.length) {
            const { record, consumed } = DtlsRecord.decode(bytes.subarray(p), this.#cipherState);
            out.push(record);
            p += consumed;
        }
        return out;
    }

    #extractHandshakeMessages(records: InboundRecord[]): InboundHandshake[] {
        const out = new Array<InboundHandshake>();
        for (const rec of records) {
            if (rec.type !== ContentType.HANDSHAKE) {
                continue;
            }
            let p = 0;
            while (p < rec.fragment.length) {
                const { message, consumed } = HandshakeMessage.decode(rec.fragment.subarray(p));
                out.push({
                    msgType: message.msgType,
                    body: message.body,
                    transcriptBytes: HandshakeMessage.encodeForTranscript(message),
                });
                p += consumed;
            }
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Outbound encoding helpers

    #emitClientHello(cookie: Uint8Array, contributesToTranscript: boolean): Uint8Array[] {
        const body = ClientHelloMessage.build({
            random: this.#clientRandom,
            cookie,
            ecjpakeKkpp: this.#round1Bytes,
        });
        const handshake = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: this.#handshakeMessageSeq,
            body,
        });
        if (contributesToTranscript) {
            this.#transcript.appendHandshakeMessage(
                HandshakeMessage.encodeForTranscript({
                    msgType: HandshakeType.CLIENT_HELLO,
                    messageSeq: this.#handshakeMessageSeq,
                    body,
                }),
            );
        }
        const record = DtlsRecord.encode({
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: this.#recordSeq,
            fragment: handshake,
        });
        this.#recordSeq += 1n;
        this.#handshakeMessageSeq += 1;
        this.#lastFlight = [record];
        return [record];
    }

    // -----------------------------------------------------------------------
    // State handlers

    #handleHelloVerifyOrServerHello(records: InboundRecord[]): DtlsClientStep {
        const messages = this.#extractHandshakeMessages(records);
        if (messages.length === 0) {
            throw new Error("DtlsClient: expected handshake message, got none");
        }
        if (messages[0].msgType === HandshakeType.HELLO_VERIFY_REQUEST) {
            const { cookie } = HelloVerifyRequestMessage.parse(messages[0].body);
            // RFC 6347 §4.2.6: the first ClientHello and HelloVerifyRequest are NOT in the
            // transcript; the transcript starts with the second ClientHello.
            this.#transcript = new HandshakeTranscript();
            const records2 = this.#emitClientHello(cookie, true);
            this.#state = "sent_clienthello_with_cookie";
            return { records: records2 };
        }
        // Cookieless server (mbedTLS always cookies, but the spec allows skipping). Seed the
        // transcript with our first (and only) ClientHello — the bytes match what we sent.
        this.#transcript = new HandshakeTranscript();
        const firstHelloBody = ClientHelloMessage.build({
            random: this.#clientRandom,
            cookie: new Uint8Array(0),
            ecjpakeKkpp: this.#round1Bytes,
        });
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.CLIENT_HELLO,
                messageSeq: 0,
                body: firstHelloBody,
            }),
        );
        return this.#consumeServerFlight(messages);
    }

    #handleServerHelloFlight(records: InboundRecord[]): DtlsClientStep {
        const messages = this.#extractHandshakeMessages(records);
        return this.#consumeServerFlight(messages);
    }

    #consumeServerFlight(messages: InboundHandshake[]): DtlsClientStep {
        if (messages.length < 3) {
            throw new Error(
                `DtlsClient: server flight needs ServerHello+ServerKeyExchange+ServerHelloDone, got ${messages.length} message(s)`,
            );
        }
        const [sh, ske, shd, ...rest] = messages;
        if (rest.length !== 0) {
            throw new Error(`DtlsClient: server flight has ${rest.length} unexpected trailing handshake message(s)`);
        }
        if (sh.msgType !== HandshakeType.SERVER_HELLO) {
            throw new Error(`DtlsClient: expected ServerHello, got msg_type=${sh.msgType}`);
        }
        if (ske.msgType !== HandshakeType.SERVER_KEY_EXCHANGE) {
            throw new Error(`DtlsClient: expected ServerKeyExchange, got msg_type=${ske.msgType}`);
        }
        if (shd.msgType !== HandshakeType.SERVER_HELLO_DONE) {
            throw new Error(`DtlsClient: expected ServerHelloDone, got msg_type=${shd.msgType}`);
        }

        const parsedSh = ServerHelloMessage.parse(sh.body);
        this.#serverRandom = parsedSh.serverRandom;
        const serverRound1 = EcJpakeRound.parseRound1(parsedSh.ecjpakeKkpp);
        this.#X3 = serverRound1.kp1.X;
        this.#X4 = serverRound1.kp2.X;
        // Verify the server's round-1 ZKPs against the curve base point.
        if (
            !SchnorrZkp.verify({
                zkp: serverRound1.kp1.zkp,
                publicKey: serverRound1.kp1.X,
                id: ECJPAKE_ID_SERVER,
            })
        ) {
            throw new Error("DtlsClient: server round-1 KP1 ZKP verification failed");
        }
        if (
            !SchnorrZkp.verify({
                zkp: serverRound1.kp2.zkp,
                publicKey: serverRound1.kp2.X,
                id: ECJPAKE_ID_SERVER,
            })
        ) {
            throw new Error("DtlsClient: server round-1 KP2 ZKP verification failed");
        }

        const skeKp = ServerKeyExchangeMessage.parse(ske.body);
        // Server-perspective round-2 generator: G' = Xp1 + Xp2 + Xm1, where for the server
        // Xp1 = X1 (our first round-1 public), Xp2 = X2 (our second), Xm1 = X3 (server's first).
        const serverGenerator = EcJpakeRound.composeRound2Generator({
            Xp1: this.#X1,
            Xp2: this.#X2,
            Xm1: this.#X3,
        });
        if (
            !EcJpakeRound.verifyRound2Zkp({
                kp: skeKp,
                generator: serverGenerator,
                peerId: ECJPAKE_ID_SERVER,
            })
        ) {
            throw new Error("DtlsClient: server round-2 ZKP verification failed");
        }

        ServerHelloDoneMessage.parse(shd.body);

        // Append all three server messages to the transcript before computing client Finished.
        this.#transcript.appendHandshakeMessage(sh.transcriptBytes);
        this.#transcript.appendHandshakeMessage(ske.transcriptBytes);
        this.#transcript.appendHandshakeMessage(shd.transcriptBytes);

        this.#state = "received_serverhello_flight";
        return this.#emitClientFlight(skeKp.X);
    }

    /**
     * Build the client's CKE + CCS + Finished flight and arm the cipher state.
     * `serverRound2X` is the server's round-2 public point (`Xp` for the PMS derivation).
     */
    #emitClientFlight(serverRound2X: Uint8Array): DtlsClientStep {
        if (this.#X3 === undefined || this.#X4 === undefined || this.#serverRandom === undefined) {
            throw new Error("DtlsClient: emitClientFlight called before server flight was parsed");
        }

        const s = bigintFromBE(this.#config.password);
        const v3 = this.#config.ephemeralScalar();
        // Client-perspective round-2 generator: G' = X3 + X4 + X1.
        const clientGenerator = EcJpakeRound.composeRound2Generator({
            Xp1: this.#X3,
            Xp2: this.#X4,
            Xm1: this.#X1,
        });
        const clientRound2 = EcJpakeRound.buildRound2({
            xm2: this.#x2,
            s,
            v: v3,
            id: ECJPAKE_ID_CLIENT,
            generator: clientGenerator,
        });

        const ckeBody = ClientKeyExchangeMessage.build(clientRound2);
        const ckeMsgSeq = this.#handshakeMessageSeq;
        const ckeHandshake = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_KEY_EXCHANGE,
            messageSeq: ckeMsgSeq,
            body: ckeBody,
        });
        this.#handshakeMessageSeq += 1;
        // Append CKE to transcript BEFORE computing Finished — the verify_data MAC covers it.
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.CLIENT_KEY_EXCHANGE,
                messageSeq: ckeMsgSeq,
                body: ckeBody,
            }),
        );

        // Derive PMS, master_secret, key_block, cipher state.
        const pms = EcJpakePms.derive({
            Xp: serverRound2X,
            Xp2: this.#X4,
            xm2: this.#x2,
            s,
        });
        const masterSecret = TlsPrf.masterSecret({
            premasterSecret: pms,
            clientRandom: this.#clientRandom,
            serverRandom: this.#serverRandom,
        });
        this.#masterSecret = masterSecret;
        const keyBlock = TlsPrf.keyBlock({
            masterSecret,
            clientRandom: this.#clientRandom,
            serverRandom: this.#serverRandom,
        });
        const cipherState = new DtlsCipherState("client", {
            clientWriteKey: keyBlock.clientWriteKey,
            serverWriteKey: keyBlock.serverWriteKey,
            clientWriteSalt: keyBlock.clientWriteIv,
            serverWriteSalt: keyBlock.serverWriteIv,
        });
        this.#cipherState = cipherState;

        // Compute client Finished verify_data over the transcript (CH..SHD..CKE).
        const verifyData = TlsPrf.verifyData({
            masterSecret,
            role: "client",
            transcriptDigest: this.#transcript.digest(),
        });
        const finishedBody = FinishedMessage.build(verifyData);
        const finishedMsgSeq = this.#handshakeMessageSeq;
        const finishedHandshake = HandshakeMessage.encode({
            msgType: HandshakeType.FINISHED,
            messageSeq: finishedMsgSeq,
            body: finishedBody,
        });
        this.#handshakeMessageSeq += 1;
        // Append Finished to transcript NOW — server's Finished is computed over the transcript
        // including our Finished, so when we verify their MAC the digest must reflect this.
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.FINISHED,
                messageSeq: finishedMsgSeq,
                body: finishedBody,
            }),
        );

        const ckeRecord = DtlsRecord.encode({
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: this.#recordSeq,
            fragment: ckeHandshake,
        });
        this.#recordSeq += 1n;
        const ccsRecord = DtlsRecord.encode({
            type: ContentType.CHANGE_CIPHER_SPEC,
            epoch: 0,
            sequenceNumber: this.#recordSeq,
            fragment: CHANGE_CIPHER_SPEC_BODY,
        });
        this.#recordSeq += 1n;
        cipherState.advanceWriteEpoch();
        const finishedSeq = cipherState.nextWriteSeq();
        const finishedRecord = DtlsRecord.encode(
            {
                type: ContentType.HANDSHAKE,
                epoch: cipherState.writeEpoch,
                sequenceNumber: finishedSeq,
                fragment: finishedHandshake,
            },
            cipherState,
        );

        const flight = [ckeRecord, ccsRecord, finishedRecord];
        this.#lastFlight = flight;
        this.#state = "sent_clientkeyexchange_flight";
        return { records: flight.map(r => r.slice()) };
    }

    /**
     * Lazy walk over the server's CCS+Finished datagram. CCS lives at epoch 0 (plaintext)
     * and the Finished record at epoch 1 (encrypted), so we MUST process CCS first to bump
     * the read epoch before attempting AEAD decryption — eagerly splitting the datagram via
     * `DtlsRecord.decode` for both records would feed CCS to the codec only after the
     * decrypt of the Finished record had already failed with a wrong-epoch error.
     */
    #handleServerFinishedFlightLazy(bytes: Uint8Array): DtlsClientStep {
        const cipherState = this.#cipherState;
        const masterSecret = this.#masterSecret;
        if (cipherState === undefined || masterSecret === undefined) {
            throw new Error("DtlsClient: server-finished handler reached without armed cipher state");
        }
        let sawCcs = false;
        let serverFinishedBody: Uint8Array | undefined;
        let serverFinishedMsgSeq = 0;
        let p = 0;
        while (p < bytes.length) {
            if (bytes.length - p < 13) {
                throw new Error("DtlsClient: short DTLS record header");
            }
            const epoch = (bytes[p + 3] << 8) | bytes[p + 4];
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + 13 + length;
            if (recordEnd > bytes.length) {
                throw new Error("DtlsClient: DTLS record length overruns datagram");
            }
            const recordBytes = bytes.subarray(p, recordEnd);
            const stateForDecode = epoch === 0 ? undefined : cipherState;
            const { record } = DtlsRecord.decode(recordBytes, stateForDecode);
            if (record.type === ContentType.CHANGE_CIPHER_SPEC) {
                ChangeCipherSpec.parse(record.fragment);
                cipherState.advanceReadEpoch();
                sawCcs = true;
            } else if (record.type === ContentType.HANDSHAKE) {
                if (!sawCcs) {
                    throw new Error("DtlsClient: encrypted Finished received before ChangeCipherSpec");
                }
                if (record.epoch !== cipherState.readEpoch) {
                    throw new Error(
                        `DtlsClient: server Finished record at epoch ${record.epoch}, expected ${cipherState.readEpoch}`,
                    );
                }
                let q = 0;
                while (q < record.fragment.length) {
                    const { message, consumed } = HandshakeMessage.decode(record.fragment.subarray(q));
                    if (message.msgType !== HandshakeType.FINISHED) {
                        throw new Error(`DtlsClient: expected Finished, got msg_type=${message.msgType}`);
                    }
                    serverFinishedBody = message.body;
                    serverFinishedMsgSeq = message.messageSeq;
                    q += consumed;
                }
            }
            // Other content types (alerts, application data) are ignored here; Phase 4 surfaces alerts.
            p = recordEnd;
        }
        if (serverFinishedBody === undefined) {
            throw new Error("DtlsClient: server flight missing Finished message");
        }

        // Snapshot the transcript BEFORE appending the server's Finished body — the server's
        // verify_data was computed over (CH..SHD..CKE..clientFinished), exactly the digest we
        // already hold from the previous append in #emitClientFlight.
        const expected = TlsPrf.verifyData({
            masterSecret,
            role: "server",
            transcriptDigest: this.#transcript.digest(),
        });
        const actual = FinishedMessage.parse(serverFinishedBody).verifyData;
        if (!constantTimeEqual(expected, actual)) {
            throw new Error("DtlsClient: server Finished verify_data mismatch");
        }
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.FINISHED,
                messageSeq: serverFinishedMsgSeq,
                body: serverFinishedBody,
            }),
        );
        this.#state = "established";
        return { records: [] };
    }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length || a.length !== FINISHED_VERIFY_DATA_LEN) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}
