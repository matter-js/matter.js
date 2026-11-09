/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DnsCodec,
    DnsMessage,
    DnsMessagePartiallyPreEncoded,
    DnsMessageType,
    DnsMessageTypeFlag,
    MAX_MDNS_MESSAGE_SIZE,
} from "#codec/DnsCodec.js";
import { Logger } from "#log/Logger.js";
import { MatterAggregateError } from "#MatterError.js";
import { Network, NetworkError } from "#net/Network.js";
import { UdpMulticastServer } from "#net/udp/UdpMulticastServer.js";
import { Bytes } from "#util/Bytes.js";
import { Lifetime } from "#util/Lifetime.js";
import { AsyncObservable, BasicObservable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import { MdnsRelevanceFilter } from "./MdnsRelevanceFilter.js";

const logger = Logger.get("MdnsListener");

const DNS_HEADER_SIZE = 12;

/**
 * Manages the UDP socket for other components that implement MDNS logic.
 */
export class MdnsSocket {
    #socket: UdpMulticastServer;
    #handlers?: Set<PromiseLike<void>>;
    #isClosed = false;
    #receipt: AsyncObservable<[message: MdnsSocket.Message]> = new BasicObservable(
        error => logger.error("Unhandled error in MDNS listener", error),
        true,
    );
    readonly #relevance = new MdnsRelevanceFilter();

    static async create(
        network: Network,
        options?: { enableIpv4?: boolean; netInterface?: string; lifetime?: Lifetime.Owner },
    ) {
        const { enableIpv4 = true, netInterface, lifetime } = options ?? {};
        const socket = new MdnsSocket(
            await UdpMulticastServer.create({
                lifetime,
                network,
                netInterface,
                broadcastAddressIpv4: enableIpv4 ? MdnsSocket.BROADCAST_IPV4 : undefined,
                broadcastAddressIpv6: MdnsSocket.BROADCAST_IPV6,
                listeningPort: MdnsSocket.BROADCAST_PORT,
            }),
        );
        return socket;
    }

    constructor(socket: UdpMulticastServer) {
        this.#socket = socket;
        socket.onMessage(this.#handleMessage.bind(this));
    }

    get network() {
        return this.#socket.network;
    }

    get supportsIpv4() {
        return this.#socket.supportsIpv4;
    }

    get netInterface() {
        return this.#socket.netInterface;
    }

    get receipt() {
        return this.#receipt;
    }

    /**
     * Declare the DNS names an owner cares about so irrelevant packets are dropped before the expensive full decode.
     * See {@link MdnsRelevanceFilter}; pass `"all"` when interest cannot be enumerated. For interest that changes one
     * name at a time, prefer {@link addRelevantName} / {@link removeRelevantName}.
     */
    registerRelevantNames(owner: string, names: Iterable<string> | "all") {
        this.#relevance.registerRelevantNames(owner, names);
    }

    addRelevantName(owner: string, name: string) {
        this.#relevance.addRelevantName(owner, name);
    }

    removeRelevantName(owner: string, name: string) {
        this.#relevance.removeRelevantName(owner, name);
    }

    unregisterRelevantNames(owner: string) {
        this.#relevance.unregisterRelevantNames(owner);
    }

    /**
     * Send {@link message}, split into datagrams that fit {@link MAX_MDNS_MESSAGE_SIZE}, to the multicast group or to
     * {@link unicastDest}.
     *
     * Every datagram is sent, also after one failed.  Without {@link intf} the transport logs a failed send, and the
     * promise resolves to undefined; it rejects with the first error when listing the interfaces or an address lookup
     * failed for a datagram.  With {@link intf} the promise reports the result for that interface, combined from the
     * result of each datagram as {@link UdpMulticastServer.send} reports it:
     *
     * | Datagrams                                                     | Result                                      |
     * |---------------------------------------------------------------|---------------------------------------------|
     * | every one left on every address family                        | resolves to `"all"`                         |
     * | none was sent, as the interface has no family the server uses | resolves to `"none"`                        |
     * | one left on no family, and none left anywhere                 | rejects with the first one's error          |
     * | any other mix                                                 | resolves to `"some"` with the first failure |
     *
     * The first failure is that of the first datagram that failed; inside a datagram it is the one that happened
     * first, see {@link UdpMulticastServer.send}.  Failures the result does not carry log at debug level.
     */
    async send(
        message: Partial<DnsMessage> & { messageType: DnsMessageType },
        intf?: string,
        unicastDest?: string,
    ): Promise<UdpMulticastServer.Reach | undefined> {
        const reach = new MessageReach(intf);
        const { messageType, queries = [] } = message;

        // Check if queries need to be split across multiple messages
        const queryChunks = this.#splitQueries(queries);

        if (queryChunks.length > 1) {
            // Query splitting required - send each chunk as an independent query message.
            // RFC 6762 does not specify how to handle queries that exceed the message size limit.
            //
            // When we split queries across multiple messages, known answer suppression will not work anyway, and it is
            // an edge case likely on start of the server when re-discovering many devices, so we likely have
            // few known answers anyway.
            //
            // See: https://www.rfc-editor.org/rfc/rfc6762.html Section 7.2
            for (const queryChunk of queryChunks) {
                const chunkMessage: DnsMessagePartiallyPreEncoded = {
                    transactionId: 0,
                    messageType,
                    queries: queryChunk,
                    answers: [],
                    authorities: message.authorities ?? [],
                    additionalRecords: [],
                };
                await reach.add(this.#send(chunkMessage, intf, unicastDest));
            }
            return reach.result();
        }

        // Normal case: all queries fit in one message - proceed with answer splitting if needed
        // When we send Queries that are too long they need to have the Truncated flag set
        const truncatedMessageType = DnsMessageType.isQuery(messageType)
            ? messageType | DnsMessageTypeFlag.TC
            : messageType;

        const chunk: DnsMessagePartiallyPreEncoded = {
            transactionId: 0,
            queries: [],
            authorities: [],

            ...message,

            answers: [],
            additionalRecords: [],
        };

        let encodedChunkWithoutAnswers = DnsCodec.encode(chunk);
        let chunkSize = encodedChunkWithoutAnswers.byteLength;

        // Add answers, splitting the message as necessary
        for (const answer of message.answers ?? []) {
            const answerEncoded = DnsCodec.encodeRecord(answer);

            if (chunkSize + answerEncoded.byteLength > MAX_MDNS_MESSAGE_SIZE) {
                // New answer does not fit anymore, send out the message
                // When sending a query, we set the Truncated flag to indicate more answers are available
                await reach.add(
                    this.#send(
                        {
                            ...chunk,
                            messageType: truncatedMessageType,
                        },
                        intf,
                        unicastDest,
                    ),
                );

                // Reset the message, length counter and included answers to count for next message
                if (chunk.queries.length) {
                    chunk.queries.length = 0;
                    encodedChunkWithoutAnswers = DnsCodec.encode(chunk);
                }
                chunk.answers.length = 0;
                chunkSize = encodedChunkWithoutAnswers.byteLength + answerEncoded.byteLength;
            } else {
                chunkSize += answerEncoded.byteLength;
            }

            chunk.answers.push(answerEncoded);
        }

        // Add "additional records", also splitting as necessary.  RFC 6762 §6 would allow omitting them on
        // overflow, but Matter peers rely on the A/AAAA records carried here, so spill into follow-up packets
        // instead
        for (const additionalRecord of message.additionalRecords ?? []) {
            const additionalRecordEncoded = DnsCodec.encodeRecord(additionalRecord);

            if (chunkSize + additionalRecordEncoded.byteLength > MAX_MDNS_MESSAGE_SIZE) {
                await reach.add(this.#send(chunk, intf, unicastDest));

                chunk.queries.length = 0;
                chunk.answers.length = 0;
                chunk.additionalRecords.length = 0;
                chunkSize = DnsCodec.encode(chunk).byteLength + additionalRecordEncoded.byteLength;
            } else {
                chunkSize += additionalRecordEncoded.byteLength;
            }

            chunk.additionalRecords.push(additionalRecordEncoded);
        }

        await reach.add(this.#send(chunk, intf, unicastDest));
        return reach.result();
    }

    /**
     * Split queries into chunks that fit within MAX_MDNS_MESSAGE_SIZE.
     * Returns an array of query arrays - if all queries fit in one message, returns [[...queries]].
     */
    #splitQueries(queries: DnsMessage["queries"]): DnsMessage["queries"][] {
        if (queries.length === 0) {
            return [[]];
        }

        const chunks: DnsMessage["queries"][] = [];
        let currentChunk: DnsMessage["queries"] = [];
        let currentChunkSize = DNS_HEADER_SIZE;

        for (const query of queries) {
            const querySize = DnsCodec.encodeQuery(query).byteLength;

            // If adding this query exceeds the limit, and we have queries in the current chunk,
            // start a new chunk
            if (currentChunkSize + querySize > MAX_MDNS_MESSAGE_SIZE && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentChunkSize = DNS_HEADER_SIZE;
            }

            currentChunk.push(query);
            currentChunkSize += querySize;
        }

        // Remember the last chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    #send(message: DnsMessagePartiallyPreEncoded, intf?: string, unicastDest?: string) {
        return this.#socket.send(DnsCodec.encode(message), intf, unicastDest);
    }

    async close() {
        this.#isClosed = true;
        await this.#socket.close();
        if (this.#handlers) {
            await MatterAggregateError.allSettled(this.#handlers);
        }
    }

    #handleMessage(bytes: Bytes, sourceIp: string, sourceIntf: string) {
        // Ignore if closed
        if (this.#isClosed) {
            return;
        }

        // Drop traffic no subscriber cares about before paying for a full decode
        if (!this.#relevance.isRelevant(bytes)) {
            return;
        }

        // Parse
        const parsed = DnsCodec.decode(bytes);

        // Skip unparseable
        if (parsed === undefined) {
            return;
        }

        const result = this.#receipt.emit({
            ...parsed,
            sourceIp,
            sourceIntf,
        }) as MaybePromise;

        if (MaybePromise.is(result)) {
            const handler: Promise<void> = Promise.resolve(result).finally(() => this.#handlers?.delete(handler));
            (this.#handlers ??= new Set()).add(handler);
        }
    }
}

export namespace MdnsSocket {
    export interface Message extends DnsMessage {
        sourceIp: string;
        sourceIntf: string;
    }

    export const BROADCAST_IPV4 = "224.0.0.251";
    export const BROADCAST_IPV6 = "ff02::fb";
    export const BROADCAST_PORT = 5353;
}

/** The reach of a message, collected from the reach or the failure of each of its datagrams. */
class MessageReach {
    readonly #netInterface?: string;
    readonly #reaches = new Array<UdpMulticastServer.Reach>();
    readonly #failures = new Array<{ error: unknown; isOnEveryFamily: boolean }>();

    constructor(netInterface?: string) {
        this.#netInterface = netInterface;
    }

    async add(sending: Promise<UdpMulticastServer.Reach | undefined>) {
        try {
            const reach = await sending;
            if (reach === undefined) {
                return;
            }
            this.#reaches.push(reach);
            if (reach.kind === "some") {
                this.#failures.push({ error: reach.failure, isOnEveryFamily: false });
            }
        } catch (error) {
            this.#failures.push({ error, isOnEveryFamily: true });
        }
    }

    /** See {@link MdnsSocket.send}. */
    result(): UdpMulticastServer.Reach | undefined {
        const datagram =
            this.#netInterface === undefined ? "mDNS datagram" : `mDNS datagram on interface ${this.#netInterface}`;
        const [firstFailure, ...others] = this.#failures;
        for (const { error, isOnEveryFamily } of others) {
            const where =
                this.#netInterface === undefined
                    ? "failed"
                    : isOnEveryFamily
                      ? "failed on every address family"
                      : "not sent on every address family";
            logger.debug(`${datagram} ${where}`, error);
        }
        const first = firstFailure?.error;
        if (this.#netInterface === undefined) {
            if (first !== undefined) {
                throw first;
            }
            return undefined;
        }
        const reachedAny = this.#reaches.some(({ kind }) => kind !== "none");
        if (!reachedAny && first !== undefined) {
            throw first;
        }
        if (this.#reaches.every(({ kind }) => kind === "none")) {
            return { kind: "none" };
        }
        if (first !== undefined) {
            return {
                kind: "some",
                failure:
                    first instanceof NetworkError ? first : new NetworkError(`${datagram} not sent`, { cause: first }),
            };
        }
        if (this.#reaches.every(({ kind }) => kind === "all")) {
            return { kind: "all" };
        }
        return {
            kind: "some",
            failure: new NetworkError(
                `mDNS datagram not sent: interface ${this.#netInterface} has no address family the server uses`,
            ),
        };
    }
}
