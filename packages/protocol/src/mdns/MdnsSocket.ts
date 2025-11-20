/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncObservable,
    BasicObservable,
    Bytes,
    Diagnostic,
    DnsCodec,
    DnsMessage,
    DnsMessagePartiallyPreEncoded,
    DnsMessageType,
    DnsMessageTypeFlag,
    Logger,
    MatterAggregateError,
    MAX_MDNS_MESSAGE_SIZE,
    MaybePromise,
    Network,
    UdpMulticastServer,
} from "#general";
import { MDNS_BROADCAST_IPV4, MDNS_BROADCAST_IPV6, MDNS_BROADCAST_PORT } from "./MdnsConsts.js";

const logger = Logger.get("MdnsListener");

/**
 * Manages the UDP socket for {@link MdnsServer} and {@link MdnsClient}.
 */
export class MdnsSocket {
    #socket: UdpMulticastServer;
    #handlers?: Set<PromiseLike<void>>;
    #isClosed = false;
    #receipt: AsyncObservable<[message: MdnsSocket.Message]> = new BasicObservable(
        error => logger.error("Unhandled error in MDNS listener", error),
        true,
    );

    static async create(network: Network, options?: { enableIpv4?: boolean; netInterface?: string }) {
        const { enableIpv4 = true, netInterface } = options ?? {};
        const socket = new MdnsSocket(
            await UdpMulticastServer.create({
                network,
                netInterface,
                broadcastAddressIpv4: enableIpv4 ? MDNS_BROADCAST_IPV4 : undefined,
                broadcastAddressIpv6: MDNS_BROADCAST_IPV6,
                listeningPort: MDNS_BROADCAST_PORT,
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
        const { messageType } = message;
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

        // Note - for size calculations we assume queries are relatively small.  We only split answers across messages
        let encodedChunkWithoutAnswers = DnsCodec.encode(chunk);
        let chunkSize = encodedChunkWithoutAnswers.byteLength;

        // Add answers, splitting message as necessary
        for (const answer of message.answers ?? []) {
            const answerEncoded = DnsCodec.encodeRecord(answer);

            if (chunkSize + answerEncoded.byteLength > MAX_MDNS_MESSAGE_SIZE) {
                if (chunk.answers.length === 0) {
                    // The first answer is already too big, log at least a warning
                    logger.warn(
                        `MDNS message with ${Diagnostic.json(
                            chunk.queries,
                        )} is too big to fit into a single MDNS message. Send anyway, but please report!`,
                    );
                }

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
}
