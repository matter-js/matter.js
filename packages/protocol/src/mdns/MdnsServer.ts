/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncCache,
    describeList,
    Diagnostic,
    DnsMessageType,
    DnsMessageTypeFlag,
    DnsRecord,
    DnsRecordType,
    Instant,
    isDeepEqual,
    Lifetime,
    Logger,
    MatterAggregateError,
    MdnsSocket,
    Millis,
    Minutes,
    NetworkInterfaceDetails,
    ObserverGroup,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";

const logger = Logger.get("MdnsServer");

/** RFC 6762 §7.3 - Window for duplicate question suppression (999ms per python-zeroconf) */
export const QUESTION_SUPPRESSION_WINDOW = Millis(999);

export class MdnsServer {
    #lifetime: Lifetime;
    #observers = new ObserverGroup();
    #recordsGenerator = new Map<string, MdnsServer.RecordGenerator>();
    readonly #records = new AsyncCache<MdnsServer.InterfaceRecords>(
        "MDNS discovery",
        async (multicastInterface: string) => {
            const byService = new Map<string, DnsRecord<any>[]>();
            const ownedNames = new Set<string>();
            const addrs = await this.network.getIpMac(multicastInterface);
            if (addrs === undefined) {
                return { byService, ownedNames };
            }

            for (const [service, generator] of this.#recordsGenerator) {
                const records = generator(multicastInterface, addrs);
                byService.set(service, records);
                for (const record of records) {
                    ownedNames.add(record.name.toLowerCase());
                }
            }

            return { byService, ownedNames };
        },
        Minutes(15) /* matches maximum standard commissioning window time */,
    );
    readonly #recordLastSentAsMulticastAnswer = new Map<string, number>();
    readonly #truncatedQueryCache = new Map<string, { message: MdnsSocket.Message; timer: Timer }>();
    /** RFC 6762 §7.3 - Tracks recently answered queries for duplicate suppression */
    readonly #recentlyAnsweredQueries = new Map<
        string,
        {
            knownAnswerHashes: Set<string>;
            timestamp: Timestamp;
        }
    >();

    readonly #socket: MdnsSocket;

    constructor(socket: MdnsSocket, lifetime = Lifetime.process) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns server");
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));
    }

    get network() {
        return this.#socket.network;
    }

    get supportsIpv4() {
        return this.#socket.supportsIpv4;
    }

    buildDnsRecordKey(record: DnsRecord<any>, netInterface?: string, unicastTarget?: string) {
        return `${record.name.toLowerCase()}-${record.recordClass}-${record.recordType}-${netInterface}-${unicastTarget}`;
    }

    async #handleMessage(incomingMessage: MdnsSocket.Message) {
        using _processing = this.#lifetime.join("processing message");

        const { byService, ownedNames } = await this.#records.get(incomingMessage.sourceIntf);

        // Ignore if we have no records for interface
        if (byService.size === 0) {
            return;
        }

        const message = this.#prepareMessage(incomingMessage);
        if (message === undefined) {
            return;
        }

        const { sourceIntf, sourceIp, transactionId, queries, answers: knownAnswers } = message;

        // Skip unrelated LAN traffic; run after #prepareMessage so TC continuations are first merged.
        if (!queries.some(q => ownedNames.has(q.name.toLowerCase()))) {
            return;
        }

        let sentPreviousPacket = false;
        for (const portRecords of byService.values()) {
            let answers = queries.flatMap(query => this.#queryRecords(query, portRecords));
            if (answers.length === 0) continue;

            // Only send additional records if the query is not for A or AAAA records
            let additionalRecords =
                queries.find(
                    query => query.recordType !== DnsRecordType.A && query.recordType !== DnsRecordType.AAAA,
                ) !== undefined
                    ? portRecords.filter(record => !answers.includes(record) && record.recordType !== DnsRecordType.PTR)
                    : [];
            if (knownAnswers.length > 0) {
                for (const knownAnswersRecord of knownAnswers) {
                    answers = answers.filter(record => !this.#suppressedByKnownAnswer(record, knownAnswersRecord));
                    if (answers.length === 0) break; // Nothing to send
                }
                if (answers.length === 0) continue; // Nothing to send
                if (additionalRecords.length > 0) {
                    for (const knownAnswersRecord of knownAnswers) {
                        additionalRecords = additionalRecords.filter(
                            record => !this.#suppressedByKnownAnswer(record, knownAnswersRecord),
                        );
                    }
                }
            }

            const now = Time.nowMs;
            let uniCastResponse = queries.filter(query => !query.uniCastResponse).length === 0;
            const answersTimeSinceLastSent = answers.map(answer => ({
                timeSinceLastMultiCast: Millis(
                    now - (this.#recordLastSentAsMulticastAnswer.get(this.buildDnsRecordKey(answer, sourceIntf)) ?? 0),
                ),
                ttl: answer.ttl,
            }));
            if (
                uniCastResponse &&
                answersTimeSinceLastSent.some(({ timeSinceLastMultiCast, ttl }) => timeSinceLastMultiCast > ttl / 4)
            ) {
                // If the query is for unicast response, still send as multicast if they were last sent as multicast longer then 1/4 of their ttl
                uniCastResponse = false;
            }
            if (!uniCastResponse) {
                answers = answers.filter(
                    // The last time sent as multicast was more than 900 ms ago
                    (_, index) => answersTimeSinceLastSent[index].timeSinceLastMultiCast >= Millis(900),
                );
                if (answers.length === 0) continue; // Nothing to send

                // RFC 6762 §7.3 - Check for duplicate question suppression
                if (this.#shouldSuppressResponse(queries, knownAnswers, sourceIntf, answers)) {
                    continue; // Another responder already answered
                }

                answers.forEach(answer =>
                    this.#recordLastSentAsMulticastAnswer.set(this.buildDnsRecordKey(answer, sourceIntf), now),
                );
            }

            if (sentPreviousPacket) {
                await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100)));
            }
            this.#socket
                .send(
                    {
                        messageType: DnsMessageType.Response,
                        transactionId,
                        answers,
                        additionalRecords,
                    },
                    sourceIntf,
                    uniCastResponse ? sourceIp : undefined,
                )
                .catch(error => {
                    logger.warn(`Failed to send mDNS response to ${sourceIp}`, error);
                });
            sentPreviousPacket = true;
        }
    }

    async #announceRecordsForInterface(netInterface: string, records: DnsRecord<any>[]) {
        const answers = records.filter(({ recordType }) => recordType === DnsRecordType.PTR);
        const additionalRecords = records.filter(({ recordType }) => recordType !== DnsRecordType.PTR);

        await this.#socket.send(
            {
                messageType: DnsMessageType.Response,
                answers,
                additionalRecords,
            },
            netInterface,
        );
    }

    async broadcast(...services: string[]) {
        using _broadcasting = this.#lifetime.join("broadcasting", Diagnostic.strong(describeList("and", ...services)));

        await MatterAggregateError.allSettled(
            (await this.#getMulticastInterfacesForAnnounce()).map(async ({ name: netInterface }) => {
                const { byService } = await this.#records.get(netInterface);
                let sentPreviousPacket = false;
                for (const [service, serviceRecords] of byService) {
                    if (services.length && !services.includes(service)) continue;

                    if (sentPreviousPacket) {
                        await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100)));
                    }
                    await this.#announceRecordsForInterface(netInterface, serviceRecords);
                    sentPreviousPacket = true;
                }
            }),
            "Error announcing MDNS messages",
        ).catch(error => logger.error(error));
    }

    async expireAnnouncements(...services: string[]) {
        using _expiring = this.#lifetime.join("expiring", Diagnostic.strong(describeList("and", ...services)));

        await MatterAggregateError.allSettled(
            this.#records.keys().map(async netInterface => {
                const { byService } = await this.#records.get(netInterface);
                let sentPreviousPacket = false;
                for (const [service, serviceRecords] of byService) {
                    if (services.length && !services.includes(service)) continue;

                    // Set TTL to Instant for all records to expire them
                    serviceRecords.forEach(record => {
                        record.ttl = Instant;
                    });

                    if (sentPreviousPacket) {
                        await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100)));
                    }
                    await this.#announceRecordsForInterface(netInterface, serviceRecords);
                    this.#recordsGenerator.delete(service);
                    sentPreviousPacket = true;
                }
            }),
            "Error happened when expiring MDNS announcements",
        ).catch(error => logger.error(error));
        await this.#resetServices();
    }

    async setRecordsGenerator(service: string, generator: MdnsServer.RecordGenerator) {
        this.#recordsGenerator.set(service, generator);
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recentlyAnsweredQueries.clear();
    }

    async #resetServices() {
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recentlyAnsweredQueries.clear();
    }

    async close() {
        using _closing = this.#lifetime.closing();
        this.#observers.close();
        await this.#records.close();
        for (const { timer } of this.#truncatedQueryCache.values()) {
            timer.stop();
        }
        this.#truncatedQueryCache.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recentlyAnsweredQueries.clear();
    }

    #getMulticastInterfacesForAnnounce() {
        const { netInterface } = this.#socket;
        return netInterface === undefined ? this.network.getNetInterfaces() : [{ name: netInterface }];
    }

    #suppressedByKnownAnswer(record: DnsRecord<any>, knownAnswer: DnsRecord<any>): boolean {
        const lcName = knownAnswer.name.toLowerCase();
        if (record.name.toLowerCase() !== lcName) return false;
        return isDeepEqual({ ...record, name: lcName }, { ...knownAnswer, name: lcName }, true);
    }

    #queryRecords({ name, recordType }: { name: string; recordType: DnsRecordType }, records: DnsRecord<any>[]) {
        // DNS names are case-insensitive per RFC 6762 §16 / RFC 1035 §2.3.3.
        const queryName = name.toLowerCase();
        if (recordType === DnsRecordType.ANY) {
            return records.filter(record => record.name.toLowerCase() === queryName);
        } else {
            return records.filter(
                record => record.name.toLowerCase() === queryName && record.recordType === recordType,
            );
        }
    }

    /**
     * RFC 6762 §7.3 - Checks if we should suppress a response because another responder
     * has recently answered the same question with answers that cover what we'd send.
     * Also, lazily cleans up expired entries from the cache.
     */
    #shouldSuppressResponse(
        queries: { name: string; recordType: DnsRecordType }[],
        knownAnswers: DnsRecord<any>[],
        sourceIntf: string,
        answers: DnsRecord<any>[],
    ): boolean {
        const now = Time.nowMs;

        // Clean up expired entries
        for (const [key, entry] of this.#recentlyAnsweredQueries) {
            if (now - entry.timestamp >= QUESTION_SUPPRESSION_WINDOW) {
                this.#recentlyAnsweredQueries.delete(key);
            }
        }

        // Build query signature; names lower-cased per RFC 6762 §16.
        const queryKey =
            queries
                .map(q => `${q.name.toLowerCase()}-${q.recordType}`)
                .sort()
                .join("|") + `-${sourceIntf}`;

        const cached = this.#recentlyAnsweredQueries.get(queryKey);

        if (cached && now - cached.timestamp < QUESTION_SUPPRESSION_WINDOW) {
            // Check if all our answers are already in the known answers from the cached response
            const answerHashes = answers.map(a => this.buildDnsRecordKey(a, sourceIntf));
            const allAnswersKnown = answerHashes.every(h => cached.knownAnswerHashes.has(h));

            if (allAnswersKnown) {
                return true; // Suppress - another responder already answered with our records
            }
        }

        // Record that we're answering this question
        const knownAnswerHashes = new Set<string>();
        for (const answer of knownAnswers) {
            knownAnswerHashes.add(this.buildDnsRecordKey(answer, sourceIntf));
        }
        // Also add our answers to the known set
        for (const answer of answers) {
            knownAnswerHashes.add(this.buildDnsRecordKey(answer, sourceIntf));
        }

        this.#recentlyAnsweredQueries.set(queryKey, {
            knownAnswerHashes,
            timestamp: now,
        });

        return false;
    }

    async #processTruncatedQuery(key: string) {
        const { message, timer } = this.#truncatedQueryCache.get(key) ?? {};
        this.#truncatedQueryCache.delete(key);
        timer?.stop();
        if (message) {
            if (message.queries.length === 0) {
                // Should not happen but ignore if it does
                return;
            }
            message.messageType &= ~DnsMessageTypeFlag.TC; // Clear TC flag
            await this.#handleMessage(message);
        }
    }

    /**
     * Delays processing of truncated messages to allow combining multiple parts or combines them if possible
     */
    #prepareMessage(newMessage: MdnsSocket.Message): MdnsSocket.Message | undefined {
        const { messageType, transactionId, sourceIntf, sourceIp } = newMessage;

        if (!DnsMessageType.isQuery(messageType)) {
            // We are only interested in queries
            return;
        }

        const key = `${transactionId}-${sourceIntf}-${sourceIp}`;
        const { message: existingMessage, timer } = this.#truncatedQueryCache.get(key) ?? {};
        this.#truncatedQueryCache.delete(key);
        timer?.stop();

        const message = existingMessage
            ? {
                  ...existingMessage,
                  queries: [...existingMessage.queries, ...newMessage.queries],
                  answers: [...existingMessage.answers, ...newMessage.answers],
                  additionalRecords: [...existingMessage.additionalRecords, ...newMessage.additionalRecords],
                  messageType: newMessage.messageType, // Keep TC flag as is from the latest message
              }
            : newMessage;

        // Message was not truncated, or we have now received all details, process it
        if ((messageType & DnsMessageTypeFlag.TC) === 0) {
            if (message.queries.length === 0) {
                // Should not happen but ignore if it does
                return;
            }
            return message;
        }

        // We have stored a new or updated truncated message - store and wait for next part
        // Delay should be max 400-500ms as per RFC 6762 section 7.2
        this.#truncatedQueryCache.set(key, {
            message,
            timer: Time.getTimer(`Truncated MDNS message ${key}`, Millis(400 + Math.floor(Math.random() * 100)), () =>
                this.#processTruncatedQuery(key),
            ).start(),
        });
    }
}

export namespace MdnsServer {
    export interface RecordGenerator {
        (intf: string, addrs: NetworkInterfaceDetails): DnsRecord[];
    }

    export interface InterfaceRecords {
        byService: Map<string, DnsRecord<any>[]>;

        /** Lower-cased names of records we own on this interface - used to fast-reject unrelated LAN queries. */
        ownedNames: Set<string>;
    }
}
