/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
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
    MaybePromise,
    MdnsSocket,
    Millis,
    NetworkInterfaceDetails,
    ObserverGroup,
    Seconds,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";

const logger = Logger.get("MdnsServer");

const RESPONDER_NAMES_OWNER = "mdns-responder";

/** RFC 6762 §7.3 - Window for duplicate question suppression (999ms per python-zeroconf) */
export const QUESTION_SUPPRESSION_WINDOW = Millis(999);

/** RFC 6762 §8.3: the second transmission of an announcement follows the first after one second */
const ANNOUNCEMENT_REPEAT_INTERVAL = Seconds(1);

/**
 * mDNS responder for the services this node publishes.
 *
 * The records of each interface are built once from the interface details and stay in use until the registrations
 * change or `Network.interfacesChanged` reports the interface.  Answering a query reads the interface details only
 * when the records of that interface do not exist yet.
 *
 * While services are registered, a reported change updates peer caches on the interfaces this server announces on.
 * The update goes out at once and again one second after the last change; changes in between merge into it.
 *
 * | Interface state after the change | Sent                                                                   |
 * |----------------------------------|------------------------------------------------------------------------|
 * | records changed                  | goodbye for each removed record, then each changed record set complete |
 * | newly served                     | all records                                                            |
 * | gone or without details          | nothing; peers drop the records when their TTL ends                    |
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-8.4} RFC 6762 §8.4
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.1} RFC 6762 §10.1
 */
export class MdnsServer {
    #lifetime: Lifetime;
    #observers = new ObserverGroup();
    #recordsGenerator = new Map<string, MdnsServer.RecordGenerator>();
    readonly #records = new Map<string, MdnsServer.InterfaceRecords>();
    readonly #building = new Map<string, Promise<MdnsServer.InterfaceRecords>>();
    readonly #pendingUpdates = new Map<string, { goodbyes: DnsRecord[]; changedSets: Set<string> }>();
    readonly #interfacesChangedObserver = (names: string[]) => this.#handleInterfacesChanged(names);
    #isFollowingInterfaces = false;
    readonly #updateRepeat = Time.getTimer("MDNS address update repeat", ANNOUNCEMENT_REPEAT_INTERVAL, () =>
        this.#repeatUpdates(),
    );
    // Union of advertised names across interfaces, fed to the socket so it keeps queries for our records (notably
    // bare-hostname A/AAAA queries, which carry no service-type label) before decoding.  Reset when records change.
    readonly #responderNames = new Set<string>();
    #hostname?: string;
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

        const { byService, ownedNames } = await this.#recordsFor(incomingMessage.sourceIntf);

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
                        answers: sendable(answers, portRecords, uniCastResponse),
                        additionalRecords: sendable(additionalRecords, portRecords, uniCastResponse),
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
        // RFC 6762 §8.3: announcements carry all records in the answer section
        await this.#socket.send(
            {
                messageType: DnsMessageType.Response,
                answers: records,
            },
            netInterface,
        );
    }

    async broadcast(...services: string[]) {
        using _broadcasting = this.#lifetime.join("broadcasting", Diagnostic.strong(describeList("and", ...services)));

        await MatterAggregateError.allSettled(
            (await this.#getMulticastInterfacesForAnnounce()).map(async ({ name: netInterface }) => {
                const { byService } = await this.#recordsFor(netInterface);
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
        ).catch(error => {
            if (this.#lifetime.isClosing) {
                logger.debug("Error announcing MDNS messages while closing", error);
            } else {
                logger.error("Error announcing MDNS messages", error);
            }
        });
    }

    async expireAnnouncements(...services: string[]) {
        using _expiring = this.#lifetime.join("expiring", Diagnostic.strong(describeList("and", ...services)));
        if (this.#lifetime.isClosing) {
            logger.debug("Not expiring mDNS announcements because the server is closed");
            return;
        }

        await MatterAggregateError.allSettled(
            [...this.#records].map(async ([netInterface, { byService }]) => {
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
                    sentPreviousPacket = true;
                }
            }),
            "Error happened when expiring MDNS announcements",
        ).catch(error => {
            if (this.#lifetime.isClosing) {
                logger.debug("Error happened when expiring MDNS announcements while closing", error);
            } else {
                logger.warn("Error happened when expiring MDNS announcements", error);
            }
        });
        for (const service of services.length ? services : [...this.#recordsGenerator.keys()]) {
            this.#recordsGenerator.delete(service);
        }
        await this.#resetServices();
    }

    async setRecordsGenerator(service: string, generator: MdnsServer.RecordGenerator) {
        this.#recordsGenerator.set(service, generator);
        await this.#resetServices();
    }

    async #resetServices() {
        await this.#chooseHostname();
        this.#followInterfaces(this.#recordsGenerator.size > 0);
        this.#records.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recentlyAnsweredQueries.clear();
        // Reset the accumulator but leave the prior footprints registered until rebuilt records replace them:
        // an empty registration here would open a window where queries for our own hostname get dropped, while stale
        // footprints only ever cause a harmless extra decode.
        this.#responderNames.clear();
    }

    // Accumulate the union of advertised names across interfaces; re-register only when it grows.  Stale entries from a
    // vanished interface are at worst extra keeps and are cleared on the next #resetServices.
    #registerResponderNames(ownedNames: Iterable<string>) {
        let changed = false;
        for (const name of ownedNames) {
            if (!this.#responderNames.has(name)) {
                this.#responderNames.add(name);
                changed = true;
            }
        }
        if (changed) {
            this.#socket.registerRelevantNames(RESPONDER_NAMES_OWNER, this.#responderNames);
        }
    }

    async close() {
        using _closing = this.#lifetime.closing();
        this.#observers.close();
        this.#followInterfaces(false);
        this.#updateRepeat.stop();
        this.#socket.unregisterRelevantNames(RESPONDER_NAMES_OWNER);
        this.#records.clear();
        this.#building.clear();
        for (const { timer } of this.#truncatedQueryCache.values()) {
            timer.stop();
        }
        this.#truncatedQueryCache.clear();
        this.#recordLastSentAsMulticastAnswer.clear();
        this.#recentlyAnsweredQueries.clear();
    }

    /**
     * Chooses the target host name of every interface: the current one while an interface still carries its MAC,
     * otherwise the first interface with addresses and a non-zero MAC.
     *
     * A querier that hears us on several interfaces must see one host per instance, so the name may not follow the
     * interface; the Matter specification permits one host name across interfaces (Core, "Host Name Construction").
     */
    async #chooseHostname() {
        try {
            const candidates = new Array<string>();
            for (const { name } of await this.#getMulticastInterfacesForAnnounce()) {
                let details;
                try {
                    details = await this.network.getIpMac(name);
                } catch (error) {
                    logger.debug(`Interface ${name} skipped for the mDNS host name`, error);
                    continue;
                }
                if (details?.ipV4.length || details?.ipV6.length) {
                    if (/[1-9a-f]/i.test(details.mac)) {
                        candidates.push(hostnameForMac(details.mac));
                    }
                }
            }
            if (this.#hostname === undefined || !candidates.includes(this.#hostname)) {
                this.#hostname = candidates[0];
            }
        } catch (error) {
            logger.warn("Cannot list network interfaces to choose the mDNS host name", error);
        }
    }

    /**
     * The records of {@link netInterface}, built from its details on first use.  Concurrent first uses share one build.
     * Throws {@link ClosedError} once the server closes.
     */
    #recordsFor(netInterface: string): MaybePromise<MdnsServer.InterfaceRecords> {
        if (this.#lifetime.isClosing) {
            throw new ClosedError("The mDNS server is closed");
        }
        const records = this.#records.get(netInterface);
        if (records !== undefined) {
            return records;
        }
        let building = this.#building.get(netInterface);
        if (building === undefined) {
            const isCurrent = () => this.#building.get(netInterface) === building;
            building = this.#buildRecords(netInterface).then(
                records => {
                    // A reset or an interface change during the build replaced it, so its records may be outdated
                    if (!isCurrent()) {
                        return this.#recordsFor(netInterface);
                    }
                    this.#building.delete(netInterface);
                    this.#records.set(netInterface, records);
                    return records;
                },
                error => {
                    if (isCurrent()) {
                        this.#building.delete(netInterface);
                    }
                    throw error;
                },
            );
            this.#building.set(netInterface, building);
        }
        return building;
    }

    async #buildRecords(netInterface: string): Promise<MdnsServer.InterfaceRecords> {
        const byService = new Map<string, DnsRecord<any>[]>();
        const ownedNames = new Set<string>();
        const addrs = await this.network.getIpMac(netInterface);
        if (this.#lifetime.isClosing) {
            throw new ClosedError("The mDNS server closed while reading the interface details");
        }
        if (addrs === undefined) {
            return { byService, ownedNames };
        }
        const hostname = this.#hostname ?? hostnameForMac(addrs.mac);

        for (const [service, generator] of this.#recordsGenerator) {
            const records = generator(netInterface, addrs, hostname);
            byService.set(service, records);
            for (const record of records) {
                ownedNames.add(record.name.toLowerCase());
            }
        }

        this.#registerResponderNames(ownedNames);

        return { byService, ownedNames };
    }

    /** Interface changes matter only while services are registered, and observing them starts the periodic checks. */
    #followInterfaces(follow: boolean) {
        if (follow === this.#isFollowingInterfaces) {
            return;
        }
        this.#isFollowingInterfaces = follow;
        if (follow) {
            this.network.interfacesChanged.on(this.#interfacesChangedObserver);
        } else {
            this.network.interfacesChanged.off(this.#interfacesChangedObserver);
        }
    }

    async #handleInterfacesChanged(names: string[]) {
        using _changing = this.#lifetime.join("interface change", Diagnostic.strong(describeList("and", ...names)));
        try {
            await this.#applyInterfaceChanges(names);
        } catch (error) {
            // The next use builds the records again from the current interface details
            this.#records.clear();
            if (this.#lifetime.isClosing) {
                logger.debug("Stopped updating the mDNS records because the server closed", error);
            } else {
                logger.warn("Cannot update the mDNS records after an interface change", error);
            }
        }
    }

    async #applyInterfaceChanges(names: string[]) {
        const previousHostname = this.#hostname;
        await this.#chooseHostname();
        const changed = new Set(names);
        if (this.#hostname !== previousHostname) {
            for (const netInterface of this.#records.keys()) {
                changed.add(netInterface);
            }
        }

        const served = new Set((await this.#getMulticastInterfacesForAnnounce()).map(({ name }) => name));
        for (const netInterface of changed) {
            await this.#rebuildRecords(netInterface, served.has(netInterface));
        }
    }

    async #rebuildRecords(netInterface: string, isServed: boolean) {
        const previous = this.#records.get(netInterface);
        this.#building.delete(netInterface);
        const current = isServed ? await this.#buildRecords(netInterface) : undefined;
        if (current === undefined || current.byService.size === 0) {
            this.#records.delete(netInterface);
            return;
        }
        this.#records.set(netInterface, current);

        const before = previous === undefined ? [] : allRecords(previous);
        const after = allRecords(current);
        const removed = before.filter(record => !after.some(other => sameRecord(record, other)));
        const added = after.filter(record => !before.some(other => sameRecord(record, other)));
        if (!removed.length && !added.length) {
            return;
        }

        const update = this.#pendingUpdates.get(netInterface) ?? { goodbyes: [], changedSets: new Set<string>() };
        update.goodbyes = uniqueRecords([...update.goodbyes, ...removed]);
        for (const record of [...removed, ...added]) {
            update.changedSets.add(setKeyOf(record));
        }
        this.#pendingUpdates.set(netInterface, update);

        await this.#sendUpdate(netInterface, update);
        this.#updateRepeat.start();
    }

    async #repeatUpdates() {
        const updates = [...this.#pendingUpdates];
        this.#pendingUpdates.clear();
        using _repeating = this.#lifetime.join("repeating interface update");
        for (const [netInterface, update] of updates) {
            await this.#sendUpdate(netInterface, update);
        }
    }

    /**
     * Send goodbyes for the records of {@link update} that the interface no longer publishes, then the current members
     * of each changed record set.  A goodbye carries no cache-flush bit, which would also remove the records that stay.
     */
    async #sendUpdate(netInterface: string, update: { goodbyes: DnsRecord[]; changedSets: Set<string> }) {
        try {
            const current = await this.#recordsFor(netInterface);
            if (current.byService.size === 0) {
                return;
            }
            const after = allRecords(current);
            const goodbyes = update.goodbyes
                .filter(record => !after.some(other => sameRecord(record, other)))
                .map(record => ({ ...record, ttl: Instant, flushCache: false }));
            const announced = after.filter(record => update.changedSets.has(setKeyOf(record)));
            await this.#announceRecordsForInterface(netInterface, [...goodbyes, ...announced]);
        } catch (error) {
            logger.debug(`Cannot send the changed mDNS records of interface ${netInterface}`, error);
        }
    }

    #getMulticastInterfacesForAnnounce() {
        const { netInterface } = this.#socket;
        return netInterface === undefined ? this.network.getNetInterfaces() : [{ name: netInterface }];
    }

    /**
     * Whether a querier's known answer already carries {@link record}.
     *
     * A record is identified by its name, type, class and value; the cache-flush bit is framing, meaningful only in a
     * response.  A known answer suppresses only while more than half its lifetime remains.
     *
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-7.1} RFC 6762 §7.1
     */
    #suppressedByKnownAnswer(record: DnsRecord<any>, knownAnswer: DnsRecord<any>): boolean {
        // Cheapest discriminators first: this runs once per (answer, known answer) pair on every inbound query
        return (
            record.recordType === knownAnswer.recordType &&
            record.recordClass === knownAnswer.recordClass &&
            knownAnswer.ttl > record.ttl / 2 &&
            sameName(record.name, knownAnswer.name) &&
            isDeepEqual(record.value, knownAnswer.value)
        );
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
        (intf: string, addrs: NetworkInterfaceDetails, hostname: string): DnsRecord[];
    }

    export interface InterfaceRecords {
        byService: Map<string, DnsRecord<any>[]>;

        /** Lower-cased names of records we own on this interface - used to fast-reject unrelated LAN queries. */
        ownedNames: Set<string>;
    }
}

function hostnameForMac(mac: string) {
    return `${mac.replace(/:/g, "").toUpperCase()}0000.local`;
}

/**
 * Prepares records for the wire, clearing the cache-flush bit wherever we cannot honor what it claims.
 *
 * The bit says the receiver may drop everything else it holds for the name and type, which is only true if this
 * response carries that whole set — suppression and rate limiting both remove records before we get here.  A legacy
 * resolver, which we cannot distinguish because the source port does not reach us, must never see the bit at all, so
 * a unicast response omits it.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.2} RFC 6762 §10.2
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-6.7} RFC 6762 §6.7
 */
function sendable(sent: DnsRecord<any>[], complete: DnsRecord<any>[], isUnicast: boolean) {
    if (isUnicast) {
        return sent.map(record => (record.flushCache ? { ...record, flushCache: false } : record));
    }

    if (!sent.some(record => record.flushCache)) {
        return sent;
    }

    const sentSizes = setSizes(sent);
    const completeSizes = setSizes(complete);

    return sent.map(record =>
        record.flushCache && (sentSizes.get(setKeyOf(record)) ?? 0) < (completeSizes.get(setKeyOf(record)) ?? 0)
            ? { ...record, flushCache: false }
            : record,
    );
}

/** Identifies the record set a record belongs to: RFC 6762 scopes the cache-flush bit to one name, type and class. */
function setKeyOf(record: DnsRecord<any>) {
    return `${record.recordType}-${record.recordClass}-${record.name.toLowerCase()}`;
}

function setSizes(records: DnsRecord<any>[]) {
    const sizes = new Map<string, number>();
    for (const record of records) {
        const key = setKeyOf(record);
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    return sizes;
}

function allRecords({ byService }: MdnsServer.InterfaceRecords) {
    return uniqueRecords([...byService.values()].flat());
}

/** RFC 6762 §10.1 identifies a record by name, type, class and data; the TTL and the cache-flush bit do not count. */
function sameRecord(a: DnsRecord<any>, b: DnsRecord<any>) {
    return setKeyOf(a) === setKeyOf(b) && isDeepEqual(a.value, b.value);
}

function uniqueRecords(records: DnsRecord<any>[]) {
    return records.filter((record, index) => records.findIndex(other => sameRecord(record, other)) === index);
}

/** DNS names are case-insensitive (RFC 6762 §16), but they rarely differ in case, so try the cheap comparison first. */
function sameName(a: string, b: string) {
    return a === b || a.toLowerCase() === b.toLowerCase();
}
