/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncCache,
    DnsMessageType,
    DnsRecord,
    DnsRecordType,
    Instant,
    isDeepEqual,
    Logger,
    MatterAggregateError,
    Millis,
    Minutes,
    NetworkInterfaceDetails,
    ObserverGroup,
    Time,
} from "#general";
import { MdnsSocket } from "./MdnsSocket.js";

const logger = Logger.get("MdnsServer");

export class MdnsServer {
    #observers = new ObserverGroup();
    #recordsGenerator = new Map<string, MdnsServer.RecordGenerator>();
    readonly #records = new AsyncCache<Map<string, DnsRecord<any>[]>>(
        "MDNS discovery",
        async (multicastInterface: string) => {
            const serviceRecords = new Map<string, DnsRecord<any>[]>();
            const addrs = await this.network.getIpMac(multicastInterface);
            if (addrs === undefined) {
                return serviceRecords;
            }

            for (const [service, generator] of this.#recordsGenerator) {
                serviceRecords.set(service, generator(multicastInterface, addrs));
            }

            return serviceRecords;
        },
        Minutes(15) /* matches maximum standard commissioning window time */,
    );
    readonly #recordLastSentAsMulticastAnswer = new Map<string, number>();

    readonly #socket: MdnsSocket;

    constructor(socket: MdnsSocket) {
        this.#socket = socket;
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));
    }

    get network() {
        return this.#socket.network;
    }

    get supportsIpv4() {
        return this.#socket.supportsIpv4;
    }

    buildDnsRecordKey(record: DnsRecord<any>, netInterface?: string, unicastTarget?: string) {
        return `${record.name}-${record.recordClass}-${record.recordType}-${netInterface}-${unicastTarget}`;
    }

    async #handleMessage(message: MdnsSocket.Message) {
        const records = await this.#records.get(message.sourceIntf);

        // Ignore if we have no records for interface
        if (records.size === 0) return;

        const { sourceIntf, sourceIp, transactionId, messageType, queries, answers: knownAnswers } = message;
        if (!DnsMessageType.isQuery(messageType)) return;
        if (queries.length === 0) return; // TODO correctly handle TruncatedQueries by waiting and combining multiple queries
        for (const portRecords of records.values()) {
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
                    answers = answers.filter(record => !isDeepEqual(record, knownAnswersRecord, true));
                    if (answers.length === 0) break; // Nothing to send
                }
                if (answers.length === 0) continue; // Nothing to send
                if (additionalRecords.length > 0) {
                    for (const knownAnswersRecord of knownAnswers) {
                        additionalRecords = additionalRecords.filter(
                            record => !isDeepEqual(record, knownAnswersRecord, true),
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

                answers.forEach(answer =>
                    this.#recordLastSentAsMulticastAnswer.set(this.buildDnsRecordKey(answer, sourceIntf), now),
                );
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
            await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100))); // as per DNS-SD spec wait 20-120ms before sending more packets
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
        await MatterAggregateError.allSettled(
            (await this.#getMulticastInterfacesForAnnounce()).map(async ({ name: netInterface }) => {
                const records = await this.#records.get(netInterface);
                for (const [service, serviceRecords] of records) {
                    if (services.length && !services.includes(service)) continue;

                    // TODO: try to combine the messages to avoid sending multiple messages but keep under 1500 bytes per message
                    await this.#announceRecordsForInterface(netInterface, serviceRecords);
                    await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100))); // as per DNS-SD spec wait 20-120ms before sending more packets
                }
            }),
            "Error announcing MDNS messages",
        ).catch(error => logger.error(error));
    }

    async expireAnnouncements(...services: string[]) {
        await MatterAggregateError.allSettled(
            this.#records.keys().map(async netInterface => {
                const records = await this.#records.get(netInterface);
                for (const [service, serviceRecords] of records) {
                    if (services.length && !services.includes(service)) continue;
                    const instanceSet = new Set<string>();
                    serviceRecords.forEach(record => {
                        record.ttl = Instant;
                        if (record.recordType === DnsRecordType.TXT) {
                            instanceSet.add(record.name);
                        }
                    });

                    // TODO: try to combine the messages to avoid sending multiple messages but keep under 1500 bytes per message
                    await this.#announceRecordsForInterface(netInterface, serviceRecords);
                    this.#recordsGenerator.delete(service);
                    await Time.sleep("MDNS delay", Millis(20 + Math.floor(Math.random() * 100))); // as per DNS-SD spec wait 20-120ms before sending more packets
                }
            }),
            "Error happened when expiring MDNS announcements",
        ).catch(error => logger.error(error));
        await this.#resetServices();
    }

    async setRecordsGenerator(service: string, generator: MdnsServer.RecordGenerator) {
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recordsGenerator.set(service, generator);
    }

    async #resetServices() {
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
    }

    async close() {
        this.#observers.close();
        await this.#records.close();
        this.#recordLastSentAsMulticastAnswer.clear();
    }

    #getMulticastInterfacesForAnnounce() {
        const { netInterface } = this.#socket;
        return netInterface === undefined ? this.network.getNetInterfaces() : [{ name: netInterface }];
    }

    #queryRecords({ name, recordType }: { name: string; recordType: DnsRecordType }, records: DnsRecord<any>[]) {
        if (recordType === DnsRecordType.ANY) {
            return records.filter(record => record.name === name);
        } else {
            return records.filter(record => record.name === name && record.recordType === recordType);
        }
    }
}

export namespace MdnsServer {
    export interface RecordGenerator {
        (intf: string, addrs: NetworkInterfaceDetails): DnsRecord[];
    }
}
