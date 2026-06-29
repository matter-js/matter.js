/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { p256 } from "@noble/curves/nist.js";
import { type Socket, createSocket } from "node:dgram";
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
import { FinishedMessage } from "../src/dtls/handshake/FinishedMessage.js";
import { HandshakeMessage } from "../src/dtls/handshake/HandshakeMessage.js";
import { HandshakeType } from "../src/dtls/handshake/HandshakeType.js";
import { HandshakeTranscript } from "../src/dtls/prf/HandshakeTranscript.js";
import { TlsPrf } from "../src/dtls/prf/TlsPrf.js";
import { ContentType } from "../src/dtls/record/ContentType.js";
import { DtlsCipherState } from "../src/dtls/record/DtlsCipherState.js";
import { DtlsRecord } from "../src/dtls/record/DtlsRecord.js";
import { NobleDtlsSocket } from "../src/dtls/socket/NobleDtlsSocket.js";

const N = p256.Point.Fn.ORDER;

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

function makeScalarStream(seed: bigint): () => bigint {
    let state = seed;
    return () => {
        state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
        const v = (state | 1n) % N;
        return v === 0n ? 1n : v;
    };
}

interface InboundRecordView {
    type: ContentType;
    epoch: number;
    sequenceNumber: bigint;
    fragment: Uint8Array;
}

/**
 * UDP-bound mirror server. Same handshake oracle as DtlsClientTest's
 * MirrorServer but driven through a real `dgram.Socket` so we exercise the
 * NobleDtlsSocket transport path end-to-end. Listens on an OS-assigned port
 * on 127.0.0.1.
 */
class UdpMirrorServer {
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
    #peerAddress: string | undefined;
    #peerPort: number | undefined;

    readonly #udp: Socket;

    /** Resolves once the bound port is known. */
    readonly bound: Promise<{ address: string; port: number }>;

    /**
     * Plaintexts decoded from epoch-1 application_data records. Tests inspect this
     * to assert app-data round-tripped correctly through the AEAD.
     */
    readonly receivedAppData = new Array<Uint8Array>();

    constructor(args: { password: Uint8Array; cookie?: Uint8Array; scalarSeed?: bigint; serverRandomFill?: number }) {
        this.#password = bigintFromBE(args.password);
        this.#cookie = args.cookie ?? Bytes.of(Bytes.fromHex("aa55cc33"));
        this.#scalars = makeScalarStream(args.scalarSeed ?? 0xfeedfacecafebaben);
        this.#serverRandom = new Uint8Array(32).fill(args.serverRandomFill ?? 0xb0);
        this.#udp = createSocket({ type: "udp4" });
        this.#udp.on("message", (msg, rinfo) => {
            this.#peerAddress = rinfo.address;
            this.#peerPort = rinfo.port;
            try {
                this.#handleDatagram(new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength));
            } catch (e) {
                // Re-emit as error so test sees it.
                this.#udp.emit("error", e instanceof Error ? e : new Error(String(e)));
            }
        });
        this.bound = new Promise((resolve, reject) => {
            this.#udp.once("error", reject);
            this.#udp.bind(0, "127.0.0.1", () => {
                const a = this.#udp.address();
                resolve({ address: a.address, port: a.port });
            });
        });
    }

    async close(): Promise<void> {
        await new Promise<void>(resolve => this.#udp.close(() => resolve()));
    }

    /** Send an encrypted application_data record to the peer (post-handshake). */
    sendAppData(plaintext: Uint8Array): void {
        const cipherState = this.#cipherState;
        if (cipherState === undefined || !this.#seenClientFinished) {
            throw new Error("UdpMirrorServer: cannot sendAppData before handshake completes");
        }
        if (this.#peerAddress === undefined || this.#peerPort === undefined) {
            throw new Error("UdpMirrorServer: peer address/port unknown");
        }
        const seq = cipherState.nextWriteSeq();
        const record = DtlsRecord.encode(
            {
                type: ContentType.APPLICATION_DATA,
                epoch: cipherState.writeEpoch,
                sequenceNumber: seq,
                fragment: plaintext,
            },
            cipherState,
        );
        this.#udp.send(record, this.#peerPort, this.#peerAddress);
    }

    #handleDatagram(bytes: Uint8Array): void {
        if (this.#expectingCookieEcho) {
            const records = this.#splitRecords(bytes);
            const reply = this.#handleFirstOrSecondClientHello(records);
            this.#sendAll(reply);
            return;
        }
        if (!this.#seenClientFinished) {
            const reply = this.#handleClientFlightLazy(bytes);
            this.#sendAll(reply);
            return;
        }
        // Post-handshake: decode app-data and stash plaintext.
        this.#handleAppDataDatagram(bytes);
    }

    #sendAll(records: Uint8Array[]): void {
        if (records.length === 0 || this.#peerAddress === undefined || this.#peerPort === undefined) {
            return;
        }
        // Concatenate to mirror real DTLS implementations that pack multiple records per datagram.
        const total = records.reduce((a, r) => a + r.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const r of records) {
            out.set(r, off);
            off += r.length;
        }
        this.#udp.send(out, this.#peerPort, this.#peerAddress);
    }

    #splitRecords(bytes: Uint8Array): InboundRecordView[] {
        const out = new Array<InboundRecordView>();
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
        let foundSuite = false;
        for (let i = 0; i < csLen; i += 2) {
            const suite = (body[p + i] << 8) | body[p + i + 1];
            if (suite === CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8) {
                foundSuite = true;
            }
        }
        if (!foundSuite) {
            throw new Error("UdpMirrorServer: ClientHello missing 0xC0FF cipher suite");
        }
        p += csLen;
        const compLen = body[p++];
        p += compLen;
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
            throw new Error("UdpMirrorServer: ClientHello missing ecjpake_kkpp extension");
        }
        return { random, cookie, ecjpakeKkpp };
    }

    #handleFirstOrSecondClientHello(records: InboundRecordView[]): Uint8Array[] {
        if (records.length !== 1 || records[0].type !== ContentType.HANDSHAKE) {
            throw new Error("UdpMirrorServer: expected single handshake record");
        }
        const { message } = HandshakeMessage.decode(records[0].fragment);
        if (message.msgType !== HandshakeType.CLIENT_HELLO) {
            throw new Error(`UdpMirrorServer: expected ClientHello, got ${message.msgType}`);
        }
        const parsed = this.#parseClientHello(message.body);
        if (parsed.cookie.length === 0) {
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
        if (!Bytes.areEqual(parsed.cookie, this.#cookie)) {
            throw new Error("UdpMirrorServer: cookie mismatch");
        }
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
        if (
            !SchnorrZkp.verify({
                zkp: this.#clientRound1.kp1.zkp,
                publicKey: this.#clientRound1.kp1.X,
                id: ECJPAKE_ID_CLIENT,
            })
        ) {
            throw new Error("UdpMirrorServer: client KP1 ZKP failed");
        }
        if (
            !SchnorrZkp.verify({
                zkp: this.#clientRound1.kp2.zkp,
                publicKey: this.#clientRound1.kp2.X,
                id: ECJPAKE_ID_CLIENT,
            })
        ) {
            throw new Error("UdpMirrorServer: client KP2 ZKP failed");
        }

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
        out[p++] = 0;
        out[p++] = (CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 >>> 8) & 0xff;
        out[p++] = CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 & 0xff;
        out[p++] = 0;
        out[p++] = (extEntryLen >>> 8) & 0xff;
        out[p++] = extEntryLen & 0xff;
        out[p++] = (EXTENSION_TYPE_ECJPAKE_KKPP >>> 8) & 0xff;
        out[p++] = EXTENSION_TYPE_ECJPAKE_KKPP & 0xff;
        out[p++] = (ecjpakeKkpp.length >>> 8) & 0xff;
        out[p++] = ecjpakeKkpp.length & 0xff;
        out.set(ecjpakeKkpp, p);
        return out;
    }

    #handleClientFlightLazy(bytes: Uint8Array): Uint8Array[] {
        let p = 0;
        let clientFinishedBody: Uint8Array | undefined;
        let clientFinishedMsgSeq = 0;
        let sawCcs = false;
        let sawCke = false;
        while (p < bytes.length) {
            if (bytes.length - p < 13) {
                throw new Error("UdpMirrorServer: short record header");
            }
            const epoch = (bytes[p + 3] << 8) | bytes[p + 4];
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + 13 + length;
            if (recordEnd > bytes.length) {
                throw new Error("UdpMirrorServer: record length overruns datagram");
            }
            const recordBytes = bytes.subarray(p, recordEnd);
            const stateForDecode = epoch === 0 ? undefined : this.#cipherState;
            const { record } = DtlsRecord.decode(recordBytes, stateForDecode);
            if (record.type === ContentType.HANDSHAKE && record.epoch === 0) {
                const { message } = HandshakeMessage.decode(record.fragment);
                if (message.msgType !== HandshakeType.CLIENT_KEY_EXCHANGE) {
                    throw new Error(`UdpMirrorServer: expected CKE, got ${message.msgType}`);
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
                    throw new Error("UdpMirrorServer: encrypted handshake before CKE/CCS");
                }
                const { message } = HandshakeMessage.decode(record.fragment);
                if (message.msgType !== HandshakeType.FINISHED) {
                    throw new Error(`UdpMirrorServer: expected Finished, got ${message.msgType}`);
                }
                clientFinishedBody = message.body;
                clientFinishedMsgSeq = message.messageSeq;
            }
            p = recordEnd;
        }
        if (!sawCke || !sawCcs || clientFinishedBody === undefined) {
            throw new Error("UdpMirrorServer: client flight missing CKE/CCS/Finished");
        }
        const cipherState = this.#cipherState;
        const masterSecret = this.#masterSecret;
        if (cipherState === undefined || masterSecret === undefined) {
            throw new Error("UdpMirrorServer: cipher state should be armed");
        }
        const expected = TlsPrf.verifyData({
            masterSecret,
            role: "client",
            transcriptDigest: this.#transcript.digest(),
        });
        const actual = FinishedMessage.parse(clientFinishedBody).verifyData;
        if (!Bytes.areEqual(expected, actual)) {
            throw new Error("UdpMirrorServer: client Finished verify_data mismatch");
        }
        this.#transcript.appendHandshakeMessage(
            HandshakeMessage.encodeForTranscript({
                msgType: HandshakeType.FINISHED,
                messageSeq: clientFinishedMsgSeq,
                body: clientFinishedBody,
            }),
        );
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
            throw new Error("UdpMirrorServer: arming before second ClientHello");
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
            throw new Error("UdpMirrorServer: client round-2 ZKP failed");
        }
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
        this.#cipherState.advanceReadEpoch();
    }

    #handleAppDataDatagram(bytes: Uint8Array): void {
        const cipherState = this.#cipherState;
        if (cipherState === undefined) {
            throw new Error("UdpMirrorServer: app-data datagram before cipher state armed");
        }
        let p = 0;
        while (p < bytes.length) {
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + 13 + length;
            const slice = bytes.subarray(p, recordEnd);
            const { record } = DtlsRecord.decode(slice, cipherState);
            if (record.type === ContentType.APPLICATION_DATA) {
                this.receivedAppData.push(record.fragment);
            }
            // close_notify alerts ignored — test asserts via socket close from the client side.
            p = recordEnd;
        }
    }
}

const DEFAULT_PASSWORD = Bytes.of(Bytes.fromHex("4a3070000000000a"));

describe("NobleDtlsSocket — UDP-bound EC-JPAKE handshake", () => {
    it("completes a cookie-exchange handshake against a UDP mirror server", async () => {
        const server = new UdpMirrorServer({ password: DEFAULT_PASSWORD });
        const { address, port } = await server.bound;

        const socket = new NobleDtlsSocket({
            address,
            port,
            password: DEFAULT_PASSWORD,
            type: "udp4",
            random: makeFixedRandom(0xa1),
            ephemeralScalar: makeScalarStream(0x1234567890abcdefn),
            connectTimeoutMs: 5000,
        });
        try {
            await socket.connect();
            expect(socket.isConnected()).to.equal(true);
        } finally {
            await socket.close();
            await server.close();
        }
    });

    it("round-trips application data after handshake completes", async () => {
        const server = new UdpMirrorServer({ password: DEFAULT_PASSWORD });
        const { address, port } = await server.bound;

        const socket = new NobleDtlsSocket({
            address,
            port,
            password: DEFAULT_PASSWORD,
            type: "udp4",
            random: makeFixedRandom(0xa2),
            ephemeralScalar: makeScalarStream(0xbeefn),
            connectTimeoutMs: 5000,
        });
        try {
            await socket.connect();

            const sent = Bytes.of(Bytes.fromHex("48656c6c6f20436f4150"));
            await socket.send(sent);

            // Wait for the server to receive (poll briefly — no synchronous handle).
            const start = Date.now();
            while (server.receivedAppData.length === 0) {
                if (Date.now() - start > 2000) {
                    throw new Error("server did not receive app data within 2s");
                }
                await new Promise(r => setTimeout(r, 10));
            }
            expect(Bytes.toHex(server.receivedAppData[0])).to.equal(Bytes.toHex(sent));

            // Server -> client direction.
            const reply = Bytes.of(Bytes.fromHex("776f726c64"));
            server.sendAppData(reply);
            const got = await socket.recv();
            expect(Bytes.toHex(got)).to.equal(Bytes.toHex(reply));
        } finally {
            await socket.close();
            await server.close();
        }
    });

    it("rejects connect() when the server never responds (handshake give-up)", async () => {
        // Bind a port so the address is reachable, but never answer datagrams.
        const sink = createSocket({ type: "udp4" });
        const sinkAddr = await new Promise<{ address: string; port: number }>((resolve, reject) => {
            sink.once("error", reject);
            sink.bind(0, "127.0.0.1", () => {
                const a = sink.address();
                resolve({ address: a.address, port: a.port });
            });
        });

        const socket = new NobleDtlsSocket({
            address: sinkAddr.address,
            port: sinkAddr.port,
            password: DEFAULT_PASSWORD,
            type: "udp4",
            random: makeFixedRandom(0xa3),
            ephemeralScalar: makeScalarStream(0xc0den),
            // Tiny intervals keep the test fast: 10ms -> 20ms. With 2 retransmits
            // total elapsed before give-up is ~70ms.
            initialRetransmitMs: 10,
            maxRetransmitMs: 20,
            maxRetransmits: 2,
            connectTimeoutMs: 1000,
        });
        let threw = false;
        try {
            await socket.connect();
        } catch (e) {
            threw = true;
            expect((e as Error).message).to.match(/gave up|timed out/);
        } finally {
            await socket.close();
            await new Promise<void>(r => sink.close(() => r()));
        }
        expect(threw).to.equal(true);
    });
});
