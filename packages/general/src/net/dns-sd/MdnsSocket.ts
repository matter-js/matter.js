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
import { Network } from "#net/Network.js";
import { UdpMulticastServer } from "#net/udp/UdpMulticastServer.js";
import { Bytes } from "#util/Bytes.js";
import { Lifetime } from "#util/Lifetime.js";
import { AsyncObservable, BasicObservable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";

const logger = Logger.get("MdnsListener");

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

    async send(message: Partial<DnsMessage> & { messageType: DnsMessageType }, intf?: string, unicastDest?: string) {
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
                await this.#send(chunkMessage, intf, unicastDest);
            }
            return;
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
                await this.#send(
                    {
                        ...chunk,
                        messageType: truncatedMessageType,
                    },
                    intf,
                    unicastDest,
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

        // Add "additional records"...  We include these but only if they fit
        const additionalRecords = message.additionalRecords ?? [];
        for (const additionalRecord of additionalRecords) {
            const additionalRecordEncoded = DnsCodec.encodeRecord(additionalRecord);
            chunkSize += additionalRecordEncoded.byteLength;
            if (chunkSize > MAX_MDNS_MESSAGE_SIZE) {
                break;
            }
            chunk.additionalRecords.push(additionalRecordEncoded);
        }

        await this.#send(chunk, intf, unicastDest);
    }

    /**
     * Split queries into chunks that fit within MAX_MDNS_MESSAGE_SIZE.
     * Returns an array of query arrays - if all queries fit in one message, returns [[...queries]].
     */
    #splitQueries(queries: DnsMessage["queries"]): DnsMessage["queries"][] {
        if (queries.length === 0) {
            return [[]];
        }

        // DNS header is 12 bytes
        const DNS_HEADER_SIZE = 12;
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

    async #send(message: DnsMessagePartiallyPreEncoded, intf?: string, unicastDest?: string) {
        await this.#socket.send(DnsCodec.encode(message), intf, unicastDest);
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

        // Parse
        const parsed = DnsCodec.decode(bytes);

        // Skip unparseable
        if (parsed === undefined) {
            return;
        }

        let promise = this.#receipt.emit({
            ...parsed,
            sourceIp,
            sourceIntf,
        }) as MaybePromise;

        if (MaybePromise.is(promise)) {
            if (this.#handlers === undefined) {
                this.#handlers = new Set();
            }
            promise = Promise.resolve(promise).finally(() => this.#handlers?.delete(promise as PromiseLike<void>));
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
