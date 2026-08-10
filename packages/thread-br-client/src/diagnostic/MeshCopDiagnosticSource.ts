/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    type Duration,
    type Entropy,
    type Environment,
    errorOf,
    ImplementationError,
    Logger,
    Millis,
    Observable,
    Seconds,
    Time,
    Timer,
} from "@matter/general";
import { BasicTlv, MeshCopTlvType } from "@matter/protocol";
import type { CoapClient } from "../coap/CoapClient.js";
import { CoapMessage } from "../coap/CoapMessage.js";
import type { Commissioner } from "../commissioner/Commissioner.js";
import { ChildIpv6AddressList } from "../tlv/diag/ChildIpv6AddressList.js";
import { ChildTable } from "../tlv/diag/ChildTable.js";
import { Connectivity } from "../tlv/diag/Connectivity.js";
import { Ipv6AddressList } from "../tlv/diag/Ipv6AddressList.js";
import { LeaderData } from "../tlv/diag/LeaderData.js";
import { MacCounters } from "../tlv/diag/MacCounters.js";
import { MleCounters } from "../tlv/diag/MleCounters.js";
import { Mode } from "../tlv/diag/Mode.js";
import { NetworkData } from "../tlv/diag/NetworkData.js";
import {
    Address16,
    BatteryLevel,
    ChannelPages,
    Eui64,
    ExtMacAddress,
    MaxChildTimeout,
    SupplyVoltage,
} from "../tlv/diag/Primitives.js";
import { Route64 } from "../tlv/diag/Route64.js";
import { RouterNeighbor } from "../tlv/diag/RouterNeighbor.js";
import { Timeout } from "../tlv/diag/Timeout.js";
import {
    ThreadStackVersion,
    VendorAppUrl,
    VendorModel,
    VendorName,
    VendorSwVersion,
    Version,
} from "../tlv/diag/VendorInfo.js";
import { Ip6AddressTlv } from "../tlv/meshcop/Ip6AddressTlv.js";
import { UdpEncapsulationTlv } from "../tlv/meshcop/UdpEncapsulationTlv.js";
import { NetworkDiagnosticTlv } from "../tlv/NetworkDiagnosticTlv.js";
import { NetworkDiagTlvType } from "../tlv/networkDiagTlvTypes.js";
import { TypeListTlv } from "../tlv/TypeListTlv.js";
import {
    ALL_THREAD_NODES_REALM_LOCAL,
    ALL_THREAD_ROUTERS_REALM_LOCAL,
    deriveMeshLocalAddress,
    formatIp6,
} from "../util/meshLocalAddr.js";
import type { DiagnosticResponse } from "./DiagnosticResponse.js";
import type { DiagnosticSource, QueryMulticastHandle, QueryMulticastOptions } from "./DiagnosticSource.js";
import { DEFAULT_RESET_TLV_TYPES } from "./DiagnosticSource.js";
import { ThreadDiagError } from "./errors.js";

export { ThreadDiagError } from "./errors.js";

const logger = Logger.get("MeshCopDiagnosticSource");

const DEFAULT_WINDOW = Seconds(20);
const DEFAULT_UNICAST_TIMEOUT = Seconds(10);

/** TMF service port on the mesh-local interface (Thread spec §5.20). */
const TMF_PORT = 61631;
/** Arbitrary ephemeral source port for the encapsulated inner UDP datagram. */
const PROXY_SRC_PORT = 49152;

/** UDP-proxy URIs on the Border Agent's commissioner CoAP server. */
const PROXY_TX_URI = ["c", "ut"];
const PROXY_RX_URI = ["c", "ur"];
/** Network-diagnostic URIs carried inside the proxied inner CoAP message. */
const DIAG_GET_URI = ["d", "dg"];
const DIAG_QUERY_URI = ["d", "dq"];
const DIAG_RESET_URI = ["d", "dr"];
/** Commissioner management scan/query URIs (sent directly on the commissioner channel). */
const ENERGY_SCAN_URI = ["c", "es"];
const ENERGY_REPORT_URI = ["c", "er"];
const PANID_QUERY_URI = ["c", "pq"];
const PANID_CONFLICT_URI = ["c", "pc"];

const DEFAULT_SCAN_TIMEOUT = Seconds(30);

export interface EnergyScanOpts {
    channelMask: number;
    count: number;
    period: number;
    scanDuration: number;
    /** How long to wait for the `c/er` report before failing. Defaults to 30s. */
    timeout?: Duration;
}

export interface EnergyScanEntry {
    channel: number;
    energy: number;
}

export interface PanIdQueryOpts {
    panId: number;
    channelMask: number;
    /** How long to wait for a `c/pc` conflict before resolving `undefined`. Defaults to 30s. */
    timeout?: Duration;
}

export interface PanIdConflict {
    conflictChannelMask: number;
}

/**
 * MeshCoP network-diagnostic source.
 *
 * External commissioners cannot send `/d/dg` or `/d/dq` directly to the Border
 * Agent — its commissioner CoAP server has no diagnostic URIs and answers 4.04.
 * Diagnostics must traverse the UDP Proxy: the inner diagnostic CoAP message is
 * wrapped in a `c/ut` (ProxyTx) request; the Border Agent emits it as a UDP
 * datagram on the mesh (TMF port 61631) and forwards each mesh reply back
 * wrapped in `c/ur` (ProxyRx). See Thread spec §8.10.
 */
export class MeshCopDiagnosticSource implements DiagnosticSource {
    readonly kind = "meshcop" as const;

    readonly #commissioner: Pick<Commissioner, "withSession">;
    readonly #coap: Pick<CoapClient, "request" | "listen">;
    readonly #entropy: Entropy;
    readonly #mlPrefix?: Bytes;
    #innerMessageId: number;

    constructor(
        commissioner: Pick<Commissioner, "withSession">,
        coap: Pick<CoapClient, "request" | "listen">,
        environment: Environment,
        mlPrefix?: Bytes,
    ) {
        this.#commissioner = commissioner;
        this.#coap = coap;
        this.#entropy = environment.get(Crypto);
        this.#mlPrefix = mlPrefix;
        this.#innerMessageId = this.#entropy.randomUint16;
    }

    canQuery(_extPanId: Bytes): boolean {
        return true;
    }

    async queryUnicast(target: { rloc16?: number; ip?: string }, tlvTypes: number[]): Promise<DiagnosticResponse> {
        if (target.ip !== undefined) {
            throw new ImplementationError(
                "MeshCopDiagnosticSource: ip-routed unicast is not supported — use rloc16 (mesh-local addressing)",
            );
        }
        if (target.rloc16 === undefined) {
            throw new ImplementationError("MeshCopDiagnosticSource: queryUnicast requires target.rloc16");
        }
        if (this.#mlPrefix === undefined) {
            throw new ImplementationError(
                "MeshCopDiagnosticSource: queryUnicast requires the mesh-local prefix; none was provided to the constructor",
            );
        }
        const targetAddr = deriveMeshLocalAddress(this.#mlPrefix, target.rloc16);
        const token = this.#freshToken();
        const innerBytes = this.#encodeInnerDiag("CON", DIAG_GET_URI, tlvTypes, token);
        const proxyPayload = this.#wrapProxyTx(targetAddr, innerBytes);

        return this.#commissioner.withSession(async () => {
            let resolveResponse!: (r: DiagnosticResponse) => void;
            let rejectResponse!: (e: Error) => void;
            const responsePromise = new Promise<DiagnosticResponse>((res, rej) => {
                resolveResponse = res;
                rejectResponse = rej;
            });

            const unsubscribe = this.#coap.listen(PROXY_RX_URI, msg => {
                const inner = unwrapProxyRx(msg.payload);
                if (inner === undefined) {
                    logger.debug("unicast c/ur unwrap empty, dropping");
                    return;
                }
                this.#ackInnerIfNeeded(inner);
                if (!tokensEqual(inner.message.token, token)) {
                    logger.debug(
                        `unicast c/ur token mismatch want=${Bytes.toHex(token)} got=${Bytes.toHex(inner.message.token)}, dropping`,
                    );
                    return;
                }
                try {
                    resolveResponse(decodeResponse(inner.message.payload));
                } catch (err) {
                    rejectResponse(errorOf(err));
                }
            });

            const timer = Time.getTimer("meshcop-unicast-timeout", DEFAULT_UNICAST_TIMEOUT, () => {
                rejectResponse(
                    new ThreadDiagError(
                        `MeshCopDiagnosticSource: unicast diagnostic to ${formatIp6(targetAddr)} timed out`,
                    ),
                );
            }).start();

            try {
                // ProxyTx is fire-and-forget: the Border Agent forwards the inner
                // datagram without answering the c/ut request, so a CON would only
                // retransmit and re-inject the query. The reply returns via c/ur.
                await this.#coap.request({
                    type: "NON",
                    code: "0.02",
                    uriPath: PROXY_TX_URI,
                    payload: proxyPayload,
                });
                return await responsePromise;
            } finally {
                timer.stop();
                unsubscribe();
            }
        });
    }

    queryMulticast(scope: "ff03::1" | "ff03::2", opts: QueryMulticastOptions): QueryMulticastHandle {
        const windowMs = opts.windowMs ?? DEFAULT_WINDOW;
        const targetAddr = scope === "ff03::1" ? ALL_THREAD_NODES_REALM_LOCAL : ALL_THREAD_ROUTERS_REALM_LOCAL;
        const onNode = new Observable<[DiagnosticResponse]>();
        const onError = new Observable<[Error]>();
        const start = Date.now();
        let nodeCount = 0;
        let closed = false;
        let unsubscribe: (() => void) | undefined;
        let windowTimer: Timer | undefined;
        let fillTimers = new Array<Timer>();
        let resolveTeardown!: () => void;
        // teardownPromise gates the inner withSession callback: when it resolves
        // (via teardown()), the callback returns and Commissioner.release() runs.
        const teardownPromise = new Promise<void>(r => {
            resolveTeardown = r;
        });

        const teardown = () => {
            if (closed) return;
            closed = true;
            if (windowTimer !== undefined) {
                windowTimer.stop();
                windowTimer = undefined;
            }
            for (const t of fillTimers) t.stop();
            fillTimers = [];
            unsubscribe?.();
            logger.debug(
                `queryMulticast DONE nodes=${nodeCount} duration=${Date.now() - start}ms window=${windowMs}ms`,
            );
            resolveTeardown();
        };

        // `done` settles AFTER Commissioner.release() so callers awaiting handle.done / handle.close()
        // see a clean resign before tearing down DTLS. (Without that ordering the reject keep-alive
        // races socket close and the BR never sees the ACK, manifesting as petition-rejected on retry.)
        const done = this.#commissioner
            .withSession(async () => {
                if (closed) return;
                logger.debug(`queryMulticast START tlvs=${opts.tlvTypes.length} window=${windowMs}ms`);
                const collected = new Array<DiagnosticResponse>();
                const probed = new Set<number>();
                const seenProxyRx = new Set<string>();
                unsubscribe = this.#coap.listen(PROXY_RX_URI, msg => {
                    if (closed) return;
                    // Some Border Agents re-deliver an identical c/ur many times (observed
                    // as a tight retransmit storm when probing the BR's own RLOC). Drop exact
                    // duplicates within the window — the first copy is fully processed/ACKed.
                    const rawKey = Bytes.toHex(msg.payload);
                    if (seenProxyRx.has(rawKey)) return;
                    seenProxyRx.add(rawKey);
                    const inner = unwrapProxyRx(msg.payload);
                    if (inner === undefined) {
                        logger.debug("c/ur unwrap empty, dropping");
                        return;
                    }
                    this.#ackInnerIfNeeded(inner);
                    if (inner.message.payload.byteLength === 0) return;
                    try {
                        const decoded = decodeResponse(inner.message.payload);
                        collected.push(decoded);
                        nodeCount++;
                        logger.debug(`c/ur arrival from=${formatIp6(inner.sourceAddr)}`);
                        onNode.emit(decoded);
                    } catch (err) {
                        logger.warn("failed to decode c/ur inner payload, dropping:", err);
                        onError.emit(errorOf(err));
                    }
                });

                // Start the collection window before sending: ProxyTx is fire-and-forget
                // (the Border Agent never answers c/ut), so gating the window on the send
                // completing would leave it unbounded.
                windowTimer = Time.getTimer("meshcop-query-window", Millis(windowMs), teardown).start();

                const token = this.#freshToken();
                const innerBytes = this.#encodeInnerDiag("NON", DIAG_QUERY_URI, opts.tlvTypes, token);
                const proxyPayload = this.#wrapProxyTx(targetAddr, innerBytes);
                try {
                    await this.#coap.request({
                        type: "NON",
                        code: "0.02",
                        uriPath: PROXY_TX_URI,
                        payload: proxyPayload,
                    });
                    logger.debug(`c/ut ProxyTx (/d/dq -> ${scope}) sent`);
                } catch (err) {
                    logger.warn(`c/ut ProxyTx send failed: ${err}`);
                    onError.emit(errorOf(err));
                }

                if (this.#mlPrefix !== undefined && !closed) {
                    const mlPrefix = this.#mlPrefix;
                    const sendUnicastFill = (): void => {
                        if (closed) return;
                        for (const routerId of missingRouterIds(collected)) {
                            if (probed.has(routerId)) continue;
                            probed.add(routerId);
                            const target = deriveMeshLocalAddress(mlPrefix, (routerId << 10) & 0xffff);
                            const fillToken = this.#freshToken();
                            const fillInner = this.#encodeInnerDiag("CON", DIAG_GET_URI, opts.tlvTypes, fillToken);
                            logger.debug(`unicast-fill router=${routerId} target=${formatIp6(target)}`);
                            void this.#coap
                                .request({
                                    type: "NON",
                                    code: "0.02",
                                    uriPath: PROXY_TX_URI,
                                    payload: this.#wrapProxyTx(target, fillInner),
                                })
                                .catch(err => logger.warn(`unicast-fill router=${routerId} send failed: ${err}`));
                        }
                    };
                    fillTimers = [
                        Time.getTimer(
                            "meshcop-unicast-fill",
                            Millis(Math.floor(windowMs / 2)),
                            sendUnicastFill,
                        ).start(),
                        Time.getTimer(
                            "meshcop-unicast-fill",
                            Millis(Math.max(0, windowMs - 2_000)),
                            sendUnicastFill,
                        ).start(),
                    ];
                } else {
                    logger.debug("unicast-fill skipped: no mesh-local prefix");
                }

                await teardownPromise;
            })
            .catch(err => {
                // Reject `done` on a fatal session failure so a total failure isn't mistaken for a
                // clean empty window; the per-node onError.emit above stay non-fatal.
                const e = errorOf(err);
                onError.emit(e);
                teardown();
                throw e;
            });

        return {
            onNode,
            onError,
            done,
            close: async () => {
                teardown();
                // close() is cleanup and must not throw; the failure surfaces via `done`. Logging it
                // also handles the rejection, so an only-close() caller never hits an unhandled one.
                await done.catch(error =>
                    logger.debug(`queryMulticast released after failure: ${errorOf(error).message}`),
                );
            },
        };
    }

    async resetCounters(target: { rloc16?: number; ip?: string }, tlvTypes = DEFAULT_RESET_TLV_TYPES): Promise<void> {
        if (target.rloc16 === undefined) {
            throw new ImplementationError("MeshCopDiagnosticSource: resetCounters requires target.rloc16");
        }
        if (this.#mlPrefix === undefined) {
            throw new ImplementationError(
                "MeshCopDiagnosticSource: resetCounters requires the mesh-local prefix; none was provided to the constructor",
            );
        }
        const targetAddr = deriveMeshLocalAddress(this.#mlPrefix, target.rloc16);
        const token = this.#freshToken();
        const innerBytes = this.#encodeInnerDiag("CON", DIAG_RESET_URI, [...tlvTypes], token);
        const proxyPayload = this.#wrapProxyTx(targetAddr, innerBytes);

        await this.#commissioner.withSession(async () => {
            // MGMT_DIAG_RESET has no response payload — no reply expected.
            await this.#coap.request({
                type: "NON",
                code: "0.02",
                uriPath: PROXY_TX_URI,
                payload: proxyPayload,
            });
        });
    }

    /**
     * Request an energy scan (MGMT_ED_SCAN) via the commissioner channel.
     *
     * Sends a `c/es` request with the four scan parameters encoded as MeshCoP TLVs.
     * The Border Router performs the scan and delivers results asynchronously in a
     * `c/er` (MGMT_ED_REPORT) message containing an ENERGY_LIST TLV — one signed
     * byte per channel in channel-number order within the mask.
     *
     * @returns Parsed energy entries sorted by channel number.
     */
    async energyScan(opts: EnergyScanOpts): Promise<Array<EnergyScanEntry>> {
        const payload = encodeScanRequest(opts);

        return this.#commissioner.withSession(async () => {
            let resolveReport!: (entries: Array<EnergyScanEntry>) => void;
            let rejectReport!: (e: Error) => void;
            const reportPromise = new Promise<Array<EnergyScanEntry>>((res, rej) => {
                resolveReport = res;
                rejectReport = rej;
            });

            // Start the timer before registering the listener: an out-of-range
            // timeout makes getTimer throw, and doing so first avoids leaking
            // the listener that a later throw would strand.
            const timer = Time.getTimer("energy-scan-timeout", opts.timeout ?? DEFAULT_SCAN_TIMEOUT, () => {
                rejectReport(new ThreadDiagError("MeshCopDiagnosticSource: energyScan timed out waiting for c/er"));
            }).start();

            const unsubscribe = this.#coap.listen(ENERGY_REPORT_URI, msg => {
                try {
                    resolveReport(decodeEnergyReport(msg.payload, opts.channelMask));
                } catch (err) {
                    rejectReport(errorOf(err));
                }
            });

            try {
                await this.#coap.request({
                    type: "NON",
                    code: "0.02",
                    uriPath: ENERGY_SCAN_URI,
                    payload,
                });
                return await reportPromise;
            } finally {
                timer.stop();
                unsubscribe();
            }
        });
    }

    /**
     * Request a PAN-ID conflict query (MGMT_PANID_QUERY) via the commissioner channel.
     *
     * Sends a `c/pq` request with CHANNEL_MASK and PAN_ID TLVs. If a conflict is
     * detected the Border Router responds with a `c/pc` (MGMT_PANID_CONFLICT) carrying
     * the conflicting channel mask and the queried PAN-ID. When no conflict is found,
     * no `c/pc` arrives and the method returns `undefined` after the timeout.
     *
     * @returns Conflict channel mask, or `undefined` when no conflict was detected
     *   within the timeout window.
     */
    async panIdQuery(opts: PanIdQueryOpts): Promise<PanIdConflict | undefined> {
        const payload = encodePanIdQuery(opts);

        return this.#commissioner.withSession(async () => {
            let resolveReport!: (result: PanIdConflict | undefined) => void;
            let rejectReport!: (e: Error) => void;
            const reportPromise = new Promise<PanIdConflict | undefined>((res, rej) => {
                resolveReport = res;
                rejectReport = rej;
            });

            // No conflict = no c/pc arrives; resolve undefined after timeout.
            // Start the timer before the listener so an out-of-range timeout
            // throws from getTimer without leaking the listener.
            const timer = Time.getTimer("panid-query-timeout", opts.timeout ?? DEFAULT_SCAN_TIMEOUT, () => {
                resolveReport(undefined);
            }).start();

            const unsubscribe = this.#coap.listen(PANID_CONFLICT_URI, msg => {
                try {
                    resolveReport(decodePanIdConflict(msg.payload, opts.panId));
                } catch (err) {
                    rejectReport(errorOf(err));
                }
            });

            try {
                await this.#coap.request({
                    type: "NON",
                    code: "0.02",
                    uriPath: PANID_QUERY_URI,
                    payload,
                });
                return await reportPromise;
            } finally {
                timer.stop();
                unsubscribe();
            }
        });
    }

    #encodeInnerDiag(type: "CON" | "NON", uriPath: string[], tlvTypes: number[], token: Bytes): Bytes {
        return CoapMessage.encode({
            type,
            code: "0.02",
            messageId: this.#nextInnerMessageId(),
            token,
            uriPath,
            payload: NetworkDiagnosticTlv.encode([
                { type: NetworkDiagTlvType.TYPE_LIST, value: TypeListTlv.encode(tlvTypes) },
            ]),
        });
    }

    #wrapProxyTx(
        targetAddr: Bytes,
        innerCoapBytes: Bytes,
        sourcePort = PROXY_SRC_PORT,
        destinationPort = TMF_PORT,
    ): Bytes {
        return BasicTlv.encode([
            {
                type: MeshCopTlvType.UDP_ENCAPSULATION,
                value: UdpEncapsulationTlv.encode({ sourcePort, destinationPort, payload: innerCoapBytes }),
            },
            { type: MeshCopTlvType.IPV6_ADDRESS, value: Ip6AddressTlv.encode(targetAddr) },
        ]);
    }

    /**
     * Acknowledge a confirmable inner diagnostic answer. Mesh nodes send
     * `/d/da` as a CON to the commissioner address; without an empty ACK
     * (matched by message id) they keep retransmitting through the proxy. The
     * ACK rides back through a fire-and-forget `c/ut` ProxyTx to the responder,
     * mirroring the datagram's ports (src = the port the node addressed, dst =
     * the node's source port) so the node correlates it to its pending CON.
     */
    #ackInnerIfNeeded(inner: ProxyRxInner): void {
        if (inner.message.type !== "CON") return;
        const ackBytes = CoapMessage.encode({
            type: "ACK",
            code: "0.00",
            messageId: inner.message.messageId,
            token: new Uint8Array(),
            payload: new Uint8Array(),
        });
        const proxyPayload = this.#wrapProxyTx(inner.sourceAddr, ackBytes, inner.destinationPort, inner.sourcePort);
        void this.#coap
            .request({ type: "NON", code: "0.02", uriPath: PROXY_TX_URI, payload: proxyPayload })
            .catch(err => logger.debug("inner ACK send failed:", err));
    }

    #nextInnerMessageId(): number {
        const id = this.#innerMessageId;
        this.#innerMessageId = (this.#innerMessageId + 1) & 0xffff;
        return id;
    }

    #freshToken(): Bytes {
        return Bytes.of(this.#entropy.randomBytes(4));
    }
}

interface ProxyRxInner {
    sourceAddr: Bytes;
    sourcePort: number;
    destinationPort: number;
    message: CoapMessage;
}

/**
 * Unwrap a `c/ur` (ProxyRx) payload: parse the outer MeshCoP TLVs, decode the
 * encapsulated inner CoAP message, and surface its diagnostic payload plus the
 * responder's source address. Returns `undefined` if the required TLVs are
 * absent or the inner CoAP message cannot be parsed.
 */
function unwrapProxyRx(payload: Bytes): ProxyRxInner | undefined {
    let entries: ReturnType<typeof BasicTlv.walk>;
    try {
        entries = BasicTlv.walk(payload);
    } catch (err) {
        logger.warn("c/ur outer TLV parse failed, dropping:", err);
        return undefined;
    }

    let encap: ReturnType<typeof UdpEncapsulationTlv.decode> | undefined;
    let sourceAddr: Bytes | undefined;
    for (const entry of entries) {
        if (entry.type === MeshCopTlvType.UDP_ENCAPSULATION) {
            encap = UdpEncapsulationTlv.decode(entry.value);
        } else if (entry.type === MeshCopTlvType.IPV6_ADDRESS) {
            sourceAddr = Ip6AddressTlv.decode(entry.value);
        }
    }
    if (encap === undefined || sourceAddr === undefined) {
        logger.debug(
            `c/ur missing TLVs: encap=${encap !== undefined} ip6=${sourceAddr !== undefined} types=[${entries.map(e => e.type).join(",")}]`,
        );
        return undefined;
    }

    let inner: CoapMessage;
    try {
        inner = CoapMessage.decode(encap.payload);
    } catch (err) {
        logger.warn("c/ur inner CoAP parse failed, dropping:", err);
        return undefined;
    }
    return { sourceAddr, sourcePort: encap.sourcePort, destinationPort: encap.destinationPort, message: inner };
}

function tokensEqual(a: Bytes, b: Bytes): boolean {
    const bufA = Bytes.of(a);
    const bufB = Bytes.of(b);
    if (bufA.length !== bufB.length) return false;
    for (let i = 0; i < bufA.length; i++) {
        if (bufA[i] !== bufB[i]) return false;
    }
    return true;
}

function encodeScanRequest(opts: EnergyScanOpts): Bytes {
    const mask = new Uint8Array(4);
    mask[0] = (opts.channelMask >> 24) & 0xff;
    mask[1] = (opts.channelMask >> 16) & 0xff;
    mask[2] = (opts.channelMask >> 8) & 0xff;
    mask[3] = opts.channelMask & 0xff;

    const count = new Uint8Array([opts.count & 0xff]);
    const period = new Uint8Array(2);
    period[0] = (opts.period >> 8) & 0xff;
    period[1] = opts.period & 0xff;
    const scanDuration = new Uint8Array(2);
    scanDuration[0] = (opts.scanDuration >> 8) & 0xff;
    scanDuration[1] = opts.scanDuration & 0xff;

    return BasicTlv.encode([
        { type: MeshCopTlvType.CHANNEL_MASK, value: mask },
        { type: MeshCopTlvType.COUNT, value: count },
        { type: MeshCopTlvType.PERIOD, value: period },
        { type: MeshCopTlvType.SCAN_DURATION, value: scanDuration },
    ]);
}

function decodeEnergyReport(payload: Bytes, channelMask: number): Array<EnergyScanEntry> {
    const entries = BasicTlv.walk(payload);
    const energyEntry = entries.find(e => e.type === MeshCopTlvType.ENERGY_LIST);
    if (energyEntry === undefined) {
        throw new ThreadDiagError("MeshCopDiagnosticSource: c/er missing ENERGY_LIST TLV");
    }
    const energyBytes = Bytes.of(energyEntry.value);
    const result = new Array<EnergyScanEntry>();
    let byteIndex = 0;
    for (let ch = 0; ch < 32; ch++) {
        if ((channelMask & (1 << ch)) !== 0) {
            if (byteIndex >= energyBytes.length) break;
            // Energy bytes are signed (dBm), stored as two's complement.
            const raw = energyBytes[byteIndex++];
            const energy = raw >= 0x80 ? raw - 0x100 : raw;
            result.push({ channel: ch, energy });
        }
    }
    return result;
}

function encodePanIdQuery(opts: PanIdQueryOpts): Bytes {
    const mask = new Uint8Array(4);
    mask[0] = (opts.channelMask >> 24) & 0xff;
    mask[1] = (opts.channelMask >> 16) & 0xff;
    mask[2] = (opts.channelMask >> 8) & 0xff;
    mask[3] = opts.channelMask & 0xff;

    const panId = new Uint8Array(2);
    panId[0] = (opts.panId >> 8) & 0xff;
    panId[1] = opts.panId & 0xff;

    return BasicTlv.encode([
        { type: MeshCopTlvType.CHANNEL_MASK, value: mask },
        { type: MeshCopTlvType.PANID, value: panId },
    ]);
}

function decodePanIdConflict(payload: Bytes, expectedPanId: number): PanIdConflict {
    const entries = BasicTlv.walk(payload);
    const maskEntry = entries.find(e => e.type === MeshCopTlvType.CHANNEL_MASK);
    if (maskEntry === undefined) {
        throw new ThreadDiagError("MeshCopDiagnosticSource: c/pc missing CHANNEL_MASK TLV");
    }
    const mv = Bytes.of(maskEntry.value);
    if (mv.length < 4) {
        throw new ThreadDiagError(`MeshCopDiagnosticSource: c/pc CHANNEL_MASK too short (${mv.length} bytes)`);
    }
    const conflictChannelMask = ((mv[0] << 24) | (mv[1] << 16) | (mv[2] << 8) | mv[3]) >>> 0;

    const panIdEntry = entries.find(e => e.type === MeshCopTlvType.PANID);
    if (panIdEntry !== undefined) {
        const panIdValue = Bytes.of(panIdEntry.value);
        if (panIdValue.length >= 2) {
            const reportedPanId = (panIdValue[0] << 8) | panIdValue[1];
            if (reportedPanId !== expectedPanId) {
                logger.warn(
                    `c/pc PAN-ID mismatch: expected=0x${expectedPanId.toString(16)} got=0x${reportedPanId.toString(16)}, ignoring`,
                );
            }
        }
    }

    return { conflictChannelMask };
}

// Router id = rloc16 top 6 bits (Thread spec); route64 entries carry router ids directly.
export function missingRouterIds(responses: ReadonlyArray<DiagnosticResponse>): number[] {
    const answered = new Set<number>();
    const referenced = new Set<number>();
    for (const r of responses) {
        if (r.rloc16 !== undefined) answered.add((r.rloc16 >> 10) & 0x3f);
        if (r.route64 !== undefined) {
            for (const e of r.route64.entries) referenced.add(e.routerId);
        }
    }
    const missing = new Array<number>();
    for (const id of referenced) {
        if (!answered.has(id)) missing.push(id);
    }
    return missing.sort((a, b) => a - b);
}

function decodeResponse(payload: Bytes): DiagnosticResponse {
    const entries = NetworkDiagnosticTlv.decode(payload);
    const result: DiagnosticResponse = { unknown: new Array<{ type: number; value: Bytes }>() };

    for (const entry of entries) {
        switch (entry.type) {
            case NetworkDiagTlvType.EXT_MAC_ADDRESS:
                result.extMacAddress = ExtMacAddress.decode(entry.value);
                break;
            case NetworkDiagTlvType.ADDRESS16:
                result.rloc16 = Address16.decode(entry.value);
                break;
            case NetworkDiagTlvType.MODE:
                result.mode = Mode.decode(entry.value);
                break;
            case NetworkDiagTlvType.TIMEOUT:
                result.timeout = Timeout.decode(entry.value);
                break;
            case NetworkDiagTlvType.CONNECTIVITY:
                result.connectivity = Connectivity.decode(entry.value);
                break;
            case NetworkDiagTlvType.ROUTE64:
                result.route64 = Route64.decode(entry.value);
                break;
            case NetworkDiagTlvType.LEADER_DATA:
                result.leaderData = LeaderData.decode(entry.value);
                break;
            case NetworkDiagTlvType.NETWORK_DATA:
                result.networkData = NetworkData.decode(entry.value);
                break;
            case NetworkDiagTlvType.IPV6_ADDRESS_LIST:
                result.ipv6Addresses = Ipv6AddressList.decode(entry.value);
                break;
            case NetworkDiagTlvType.MAC_COUNTERS:
                result.macCounters = MacCounters.decode(entry.value);
                break;
            case NetworkDiagTlvType.BATTERY_LEVEL:
                result.batteryLevel = BatteryLevel.decode(entry.value);
                break;
            case NetworkDiagTlvType.SUPPLY_VOLTAGE:
                result.supplyVoltage = SupplyVoltage.decode(entry.value);
                break;
            case NetworkDiagTlvType.CHILD_TABLE:
                result.childTable = ChildTable.decode(entry.value);
                break;
            case NetworkDiagTlvType.CHILD_IPV6_ADDRESS_LIST:
                result.childIpv6Addresses = ChildIpv6AddressList.decode(entry.value);
                break;
            case NetworkDiagTlvType.ROUTER_NEIGHBOR:
                result.routerNeighbors = RouterNeighbor.decode(entry.value);
                break;
            case NetworkDiagTlvType.CHANNEL_PAGES:
                result.channelPages = ChannelPages.decode(entry.value);
                break;
            case NetworkDiagTlvType.MAX_CHILD_TIMEOUT:
                result.maxChildTimeout = MaxChildTimeout.decode(entry.value);
                break;
            case NetworkDiagTlvType.EUI64:
                result.eui64 = Eui64.decode(entry.value);
                break;
            case NetworkDiagTlvType.VERSION:
                result.version = Version.decode(entry.value);
                break;
            case NetworkDiagTlvType.VENDOR_NAME:
                result.vendorName = VendorName.decode(entry.value);
                break;
            case NetworkDiagTlvType.VENDOR_MODEL:
                result.vendorModel = VendorModel.decode(entry.value);
                break;
            case NetworkDiagTlvType.VENDOR_SW_VERSION:
                result.vendorSwVersion = VendorSwVersion.decode(entry.value);
                break;
            case NetworkDiagTlvType.THREAD_STACK_VERSION:
                result.threadStackVersion = ThreadStackVersion.decode(entry.value);
                break;
            case NetworkDiagTlvType.MLE_COUNTERS:
                result.mleCounters = MleCounters.decode(entry.value);
                break;
            case NetworkDiagTlvType.VENDOR_APP_URL:
                result.vendorAppUrl = VendorAppUrl.decode(entry.value);
                break;
            default:
                result.unknown.push({ type: entry.type, value: entry.value });
                break;
        }
    }

    return result;
}
