/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncCache,
    Diagnostic,
    DnsCodec,
    DnsMessage,
    DnsMessagePartiallyPreEncoded,
    DnsMessageType,
    DnsRecord,
    DnsRecordType,
    isDeepEqual,
    Logger,
    MatterAggregateError,
    MAX_MDNS_MESSAGE_SIZE,
    Network,
    Time,
    UdpMulticastServer,
} from "#general";

const logger = Logger.get("MdnsServer");

export const MDNS_BROADCAST_IPV4 = "224.0.0.251";
export const MDNS_BROADCAST_IPV6 = "ff02::fb";
export const MDNS_BROADCAST_PORT = 5353;

export enum AnnouncementType {
    Commissionable,
    Operative,
}

export class MdnsServer {
    static async create(network: Network, options?: { enableIpv4?: boolean; netInterface?: string }) {
        const { enableIpv4 = true, netInterface } = options ?? {};
        return new MdnsServer(
            network,
            await UdpMulticastServer.create({
                network,
                netInterface,
                broadcastAddressIpv4: enableIpv4 ? MDNS_BROADCAST_IPV4 : undefined,
                broadcastAddressIpv6: MDNS_BROADCAST_IPV6,
                listeningPort: MDNS_BROADCAST_PORT,
            }),
            netInterface,
        );
    }

    #recordsGenerator = new Map<string, (netInterface: string) => Promise<DnsRecord<any>[]>>();
    readonly #records = new AsyncCache<Map<string, DnsRecord<any>[]>>(
        "MDNS discovery",
        async (multicastInterface: string) => {
            const portTypeMap = new Map<string, DnsRecord<any>[]>();
            for (const [announceTypePort, generator] of this.#recordsGenerator) {
                portTypeMap.set(announceTypePort, await generator(multicastInterface));
            }
            return portTypeMap;
        },
        15 * 60 * 1000 /* 15mn - also matches maximum commissioning window time. */,
    );
    readonly #recordLastSentAsMulticastAnswer = new Map<string, number>();
    readonly #recordLastSentAsUnicastAnswer = new Map<string, number>();

    readonly #network: Network;
    readonly #multicastServer: UdpMulticastServer;
    readonly #netInterface: string | undefined;

    constructor(network: Network, multicastServer: UdpMulticastServer, netInterface: string | undefined) {
        multicastServer.onMessage(
            (message, remoteIp, netInterface) => void this.#handleDnsMessage(message, remoteIp, netInterface),
        );
        this.#network = network;
        this.#multicastServer = multicastServer;
        this.#netInterface = netInterface;
    }

    buildDnsRecordKey(record: DnsRecord<any>, netInterface?: string, unicastTarget?: string) {
        return `${record.name}-${record.recordClass}-${record.recordType}-${netInterface}-${unicastTarget}`;
    }

    buildTypePortKey(type: AnnouncementType, port: number) {
        return `${port}-${type}`;
    }

    isKeyForPort(key: string, port: number) {
        return key.startsWith(`${port}-`);
    }

    async #handleDnsMessage(messageBytes: Uint8Array, remoteIp: string, netInterface: string) {
        // This message was on a subnet not supported by this device
        if (netInterface === undefined) return;
        const records = await this.#records.get(netInterface);

        // No need to process the DNS message if there are no records to serve
        if (records.size === 0) return;

        const message = DnsCodec.decode(messageBytes);
        if (message === undefined) return; // The message cannot be parsed
        const { transactionId, messageType, queries, answers: knownAnswers } = message;
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

            const now = Time.nowMs();
            let uniCastResponse = queries.filter(query => !query.uniCastResponse).length === 0;
            const answersTimeSinceLastSent = answers.map(answer => ({
                timeSinceLastMultiCast:
                    now -
                    (this.#recordLastSentAsMulticastAnswer.get(this.buildDnsRecordKey(answer, netInterface)) ?? 0),
                timeSinceLastUniCast:
                    now -
                    (this.#recordLastSentAsUnicastAnswer.get(this.buildDnsRecordKey(answer, netInterface, remoteIp)) ??
                        0),
                ttl: answer.ttl,
            }));
            if (
                uniCastResponse &&
                answersTimeSinceLastSent.some(
                    ({ timeSinceLastMultiCast, ttl }) => timeSinceLastMultiCast > (ttl / 4) * 1000,
                )
            ) {
                // If the query is for unicast response, still send as multicast if they were last sent as multicast longer then 1/4 of their ttl
                uniCastResponse = false;
            }
            if (!uniCastResponse) {
                answers = answers.filter((_, index) => answersTimeSinceLastSent[index].timeSinceLastMultiCast > 1000);
                if (answers.length === 0) continue; // Nothing to send

                answers.forEach(answer =>
                    this.#recordLastSentAsMulticastAnswer.set(this.buildDnsRecordKey(answer, netInterface), now),
                );
            } else {
                answers = answers.filter((_, index) => answersTimeSinceLastSent[index].timeSinceLastUniCast > 1000);
                if (answers.length === 0) continue; // Nothing to send

                answers.forEach(answer =>
                    this.#recordLastSentAsUnicastAnswer.set(
                        this.buildDnsRecordKey(answer, netInterface, remoteIp),
                        now,
                    ),
                );
            }

            this.#sendRecords(
                {
                    messageType: DnsMessageType.Response,
                    transactionId,
                    answers,
                    additionalRecords,
                },
                netInterface,
                uniCastResponse ? remoteIp : undefined,
            ).catch(error => {
                logger.warn(`Failed to send mDNS response to ${remoteIp}`, error);
            });
            await Time.sleep("MDNS delay", 20 + Math.floor(Math.random() * 100)); // as per DNS-SD spec wait 20-120ms before sending more packets
        }
    }

    async #announceRecordsForInterface(netInterface: string, records: DnsRecord<any>[]) {
        const answers = records.filter(({ recordType }) => recordType === DnsRecordType.PTR);
        const additionalRecords = records.filter(({ recordType }) => recordType !== DnsRecordType.PTR);

        await this.#sendRecords(
            {
                messageType: DnsMessageType.Response,
                answers,
                additionalRecords,
            },
            netInterface,
        );
    }

    async #sendRecords(dnsMessageData: Partial<DnsMessage>, netInterface: string, unicastTarget?: string) {
        const { answers = [], additionalRecords = [] } = dnsMessageData;
        const answersToSend = [...answers];
        const additionalRecordsToSend = [...additionalRecords];

        const dnsMessageDataToSend = {
            ...dnsMessageData,
            answers: [],
            additionalRecords: [],
        } as DnsMessagePartiallyPreEncoded;

        const emptyDnsMessage = DnsCodec.encode(dnsMessageDataToSend);
        let dnsMessageSize = emptyDnsMessage.length;

        while (true) {
            if (answersToSend.length > 0) {
                const nextAnswer = answersToSend.shift();
                if (nextAnswer === undefined) {
                    break;
                }

                const nextAnswerEncoded = DnsCodec.encodeRecord(nextAnswer);
                dnsMessageSize += nextAnswerEncoded.length; // Add additional record as long as size is ok

                if (dnsMessageSize > MAX_MDNS_MESSAGE_SIZE) {
                    // New answer do not fit anymore, send out the message
                    await this.#multicastServer.send(
                        DnsCodec.encode(dnsMessageDataToSend),
                        netInterface,
                        unicastTarget,
                    );

                    // Reset the message, length counter and included answers to count for next message
                    dnsMessageDataToSend.answers.length = 0;
                    dnsMessageSize = emptyDnsMessage.length + nextAnswerEncoded.length;
                }
                dnsMessageDataToSend.answers.push(nextAnswerEncoded);
            } else {
                break;
            }
        }

        for (const additionalRecord of additionalRecordsToSend) {
            const additionalRecordEncoded = DnsCodec.encodeRecord(additionalRecord);
            dnsMessageSize += additionalRecordEncoded.length; // Add additional record as long as size is ok
            if (dnsMessageSize > MAX_MDNS_MESSAGE_SIZE) {
                break;
            }
            dnsMessageDataToSend.additionalRecords.push(additionalRecordEncoded);
        }

        await this.#multicastServer.send(DnsCodec.encode(dnsMessageDataToSend), netInterface, unicastTarget);
    }

    async announce(announcedNetPort?: number) {
        await MatterAggregateError.allSettled(
            (await this.#getMulticastInterfacesForAnnounce()).map(async ({ name: netInterface }) => {
                const records = await this.#records.get(netInterface);
                for (const [portType, portTypeRecords] of records) {
                    if (announcedNetPort !== undefined && !this.isKeyForPort(portType, announcedNetPort)) continue;

                    // TODO: try to combine the messages to avoid sending multiple messages but keep under 1500 bytes per message
                    await this.#announceRecordsForInterface(netInterface, portTypeRecords);
                    await Time.sleep("MDNS delay", 20 + Math.floor(Math.random() * 100)); // as per DNS-SD spec wait 20-120ms before sending more packets
                }
            }),
            "Error happened when announcing MDNS messages",
        ).catch(error => logger.error(error));
    }

    async expireAnnouncements(options?: { announcedNetPort?: number; type?: AnnouncementType; forInstance?: string }) {
        const { announcedNetPort, type, forInstance: instanceToExpire } = options ?? {};
        await MatterAggregateError.allSettled(
            this.#records.keys().map(async netInterface => {
                const records = await this.#records.get(netInterface);
                for (const [portType, portTypeRecords] of records) {
                    if (announcedNetPort !== undefined && !this.isKeyForPort(portType, announcedNetPort)) continue;
                    if (
                        announcedNetPort !== undefined &&
                        type !== undefined &&
                        portType !== this.buildTypePortKey(type, announcedNetPort)
                    )
                        continue;
                    const recordsToProcess =
                        instanceToExpire !== undefined
                            ? portTypeRecords.filter(
                                  ({ forInstance }) => forInstance !== undefined && instanceToExpire === forInstance,
                              )
                            : portTypeRecords;
                    const instanceSet = new Set<string>();
                    recordsToProcess.forEach(record => {
                        record.ttl = 0;
                        if (record.recordType === DnsRecordType.TXT) {
                            instanceSet.add(record.name);
                        }
                    });
                    const instanceName =
                        instanceSet.size > 1
                            ? "multiple"
                            : instanceSet.size === 1
                              ? Array.from(instanceSet.values())[0]
                              : "";
                    logger.debug(
                        `Expiring records`,
                        Diagnostic.dict({
                            instanceName,
                            port: announcedNetPort,
                            netInterface,
                        }),
                    );

                    // TODO: try to combine the messages to avoid sending multiple messages but keep under 1500 bytes per message
                    await this.#announceRecordsForInterface(netInterface, portTypeRecords);
                    this.#recordsGenerator.delete(portType);
                    await Time.sleep("MDNS delay", 20 + Math.floor(Math.random() * 100)); // as per DNS-SD spec wait 20-120ms before sending more packets
                }
            }),
            "Error happened when expiring MDNS announcements",
        ).catch(error => logger.error(error));
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recordLastSentAsUnicastAnswer.clear();
    }

    async setRecordsGenerator(
        hostPort: number,
        type: AnnouncementType,
        generator: (netInterface: string) => Promise<DnsRecord<any>[]>,
    ) {
        await this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recordLastSentAsUnicastAnswer.clear();
        this.#recordsGenerator.set(this.buildTypePortKey(type, hostPort), generator);
    }

    async close() {
        await this.#records.close();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recordLastSentAsUnicastAnswer.clear();
        await this.#multicastServer.close();
    }

    #getMulticastInterfacesForAnnounce() {
        return this.#netInterface === undefined ? this.#network.getNetInterfaces() : [{ name: this.#netInterface }];
    }

    #queryRecords({ name, recordType }: { name: string; recordType: DnsRecordType }, records: DnsRecord<any>[]) {
        if (recordType === DnsRecordType.ANY) {
            return records.filter(record => record.name === name);
        } else {
            return records.filter(record => record.name === name && record.recordType === recordType);
        }
    }
}
