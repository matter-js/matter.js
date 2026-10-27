/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ClosedError,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecord,
    DnsRecordType,
    Instant,
    isDeepEqual,
    Logger,
    MaybePromise,
    MdnsSocket,
    Millis,
    Minutes,
    Mutex,
    NetworkInterfaceDetails,
    Seconds,
    SrvRecordValue,
    Time,
    Timer,
} from "@matter/general";
import type { MdnsServer } from "./MdnsServer.js";

// Same facility as MdnsServer: operators see one mDNS responder component
const logger = Logger.get("MdnsServer");

/** RFC 6762 §6 allows one multicast of a record per second and interface */
const MULTICAST_INTERVAL = Seconds(1);

/**
 * How long interface details stay in use before they are read again, and how long an interface whose peers cache
 * nothing stays unused before its state is dropped.  Matches the maximum commissioning window.
 */
const INTERFACE_LIFETIME = Minutes(15);

/** How long after a failed or empty read of the interface details they are read again */
const DETAILS_RETRY_INTERVAL = Seconds(10);

/** The longest wait between two attempts to send a goodbye that did not leave; the first attempt waits a second */
const GOODBYE_RETRY_MAXIMUM_INTERVAL = Minutes(1);

/**
 * The mDNS responder state of one network interface, and the only path by which {@link MdnsServer} sends on it.
 *
 * The state is a record of what peer caches on this interface may hold: each record sent here, with the time its
 * TTL ends and the time it was last multicast, a goodbye included.  Every decision reads it, and every send writes
 * it as far as the message reached, see {@link #transmit}:
 *
 * | Decision                       | Reads                                                                         |
 * |--------------------------------|-------------------------------------------------------------------------------|
 * | goodbye content                | cached records that the current records of the registrations no longer hold   |
 * | RFC 6762 §6 one-second rule    | last multicast of each record; a held record is deferred, not dropped         |
 * | RFC 6762 §5.4 quarter-TTL rule | last multicast of each answer that peers still cache                          |
 * | end of the interface state     | nothing cached or deferred, no goodbye retry waits, unused for 15 minutes     |
 *
 * The one-second rule applies to every multicast except goodbyes: answers, additional records and announcements.  A
 * goodbye counts as the last multicast of its record, but is itself never held.  A record the rule holds back is
 * deferred to the moment its second has passed; all records due then go out in one deferred message under the same
 * rule, so a record held again is deferred again.  The address records of one name are held together (RFC 6762
 * §6.2).  A held record is not sent when the querier already has it: a multicast that carried the record, not its
 * goodbye, left at or after the query arrived or the record was deferred.  A known answer of the querier is not sent
 * either, and a deferred record that its service no longer publishes is dropped.  RFC 6762 §6 would also accept
 * dropping a held record, because "a querier that did not receive and cache the previous transmission will retry its
 * request"; deferring costs one more message and spares the querier that retry.
 *
 * Each packet is composed inside a task of one {@link Mutex}: the task decides the content and calls
 * {@link MdnsSocket.send} with no await in between, and the next task starts only after that send settled.  So a
 * packet never carries a decision that changed while it waited, and no chunk of an earlier packet follows a later
 * packet.  The delays between the packets of one answer happen outside the mutex.  Records returned by the
 * generators are never changed.  Times come from {@link Time.nowUs}, which is monotonic where the platform provides
 * `performance`.
 */
export class InterfaceResponder {
    readonly name: string;
    readonly #owner: InterfaceResponder.Owner;
    readonly #gate: Mutex;
    #details?: NetworkInterfaceDetails;
    #detailsVersion = 0;
    #detailsExpireAt = 0;
    #retryReadAt = 0;
    #reading?: Promise<void>;
    #view?: View;
    /** What peer caches on this interface may hold, keyed by {@link recordKeyOf} */
    readonly #peerCache = new Map<string, PeerCacheEntry>();
    /** Records the RFC 6762 §6 rule held back, keyed by {@link recordKeyOf} */
    readonly #deferred = new Map<string, Deferral>();
    #deferredTimer?: Timer;
    #goodbyeRetry?: { timer: Timer; interval: number };
    #usedAt: number;
    #isListed = true;
    #isClosing = false;
    /** Whether a read failed while no details were known; valid details are never forgotten, so this ends nothing */
    #isDetailsFailing = false;
    /** Set by a multicast that failed or missed an address family; cleared by one that reached every family */
    #isMulticastOutage = false;

    constructor(name: string, owner: InterfaceResponder.Owner) {
        this.name = name;
        this.#owner = owner;
        this.#gate = new Mutex(this);
        this.#usedAt = Time.nowUs;
    }

    toString() {
        return `mDNS responder on ${this.name}`;
    }

    /** The last valid details read, if any. */
    get details() {
        return this.#details;
    }

    /**
     * Whether the details should be read before the next answer or announcement: never read, read longer than
     * {@link INTERFACE_LIFETIME} ago, and no failed read waiting for its retry.
     */
    get needsDetailsRead() {
        const now = Time.nowUs;
        return this.#detailsExpireAt <= now && this.#retryReadAt <= now;
    }

    /** Whether the last interface listing included this interface. */
    get isListed() {
        return this.#isListed;
    }

    set isListed(isListed: boolean) {
        this.#isListed = isListed;
    }

    /**
     * Forget records whose TTL ended and whose last multicast is more than a second ago.  Returns whether this state
     * can go: peers cache nothing sent here, nothing is deferred, no goodbye retry waits, and neither {@link answer}
     * nor {@link publish} ran for {@link INTERFACE_LIFETIME}.
     */
    prune() {
        const now = Time.nowUs;
        for (const [key, { cachedUntil, lastMulticastAt }] of this.#peerCache) {
            if (cachedUntil <= now && now - (lastMulticastAt ?? -Infinity) >= MULTICAST_INTERVAL) {
                this.#peerCache.delete(key);
            }
        }
        return (
            this.#peerCache.size === 0 &&
            this.#deferred.size === 0 &&
            !this.#goodbyeRetry?.timer.isRunning &&
            now - this.#usedAt > INTERFACE_LIFETIME
        );
    }

    /**
     * Read the addresses and MAC of this interface; synchronous if the network reports them synchronously.
     * Concurrent reads share one lookup.
     *
     * A read that fails or reports no details never replaces valid details read before: those stay in use, and no
     * read happens again before {@link DETAILS_RETRY_INTERVAL} passed; until then this returns at once.  Without
     * earlier details, a failed read throws what the network throws, after logging it: a notice for the first failure,
     * debug for later ones.
     */
    readDetails(): MaybePromise<void> {
        if (this.#reading !== undefined) {
            return this.#reading;
        }
        if (this.#retryReadAt > Time.nowUs) {
            return;
        }
        let details;
        try {
            details = this.#owner.socket.network.getIpMac(this.name);
        } catch (error) {
            this.#readFailed(error);
            return;
        }
        if (!MaybePromise.is(details)) {
            this.#setDetails(details);
            return;
        }
        return (this.#reading = Promise.resolve(details)
            .then(
                details => this.#setDetails(details),
                error => this.#readFailed(error),
            )
            .finally(() => (this.#reading = undefined)));
    }

    #setDetails(details: NetworkInterfaceDetails | undefined) {
        const now = Time.nowUs;
        if (details === undefined) {
            if (this.#details !== undefined) {
                logger.debug(`Keeping the last details of interface ${this.name}, which reports none now`);
            }
            this.#retryReadAt = now + DETAILS_RETRY_INTERVAL;
            return;
        }
        if (!isDeepEqual(details, this.#details)) {
            this.#details = details;
            this.#detailsVersion++;
        }
        this.#detailsExpireAt = now + INTERFACE_LIFETIME;
        this.#retryReadAt = 0;
    }

    /**
     * Without earlier details, the first failure logs a notice and later ones log at debug level; the error is
     * rethrown, so the caller does not log it again.  With earlier details, those stay in use.
     */
    #readFailed(error: unknown) {
        this.#retryReadAt = Time.nowUs + DETAILS_RETRY_INTERVAL;
        if (this.#details !== undefined) {
            logger.debug(`Keeping the last details of interface ${this.name}, which cannot be read`, error);
            return;
        }
        if (this.#isDetailsFailing) {
            logger.debug(`Details of interface ${this.name} cannot be read`, error);
        } else {
            this.#isDetailsFailing = true;
            logger.notice(`Details of interface ${this.name} cannot be read`, error);
        }
        throw error;
    }

    /** The names of the records of the current registrations; empty without valid details. */
    names(): ReadonlySet<string> {
        return this.#currentView(false)?.ownedNames ?? new Set();
    }

    /**
     * Answer a query: one packet per service with answers, 20–120 ms apart.  Settles once these packets are sent.
     * A failed send is logged and does not stop the next packet.  Records the one-second rule holds back are
     * deferred, see the class description.
     *
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-6} RFC 6762 §6
     */
    async answer(message: MdnsSocket.Message) {
        const receivedAt = (this.#usedAt = Time.nowUs);
        const view = this.#currentView();
        if (view === undefined || !message.queries.some(({ name }) => view.ownedNames.has(name.toLowerCase()))) {
            return;
        }

        const visited = new Set<string>();
        let more: boolean | undefined = false;
        do {
            if (more) {
                await Time.sleep("MDNS delay", packetDelay());
            }
            more = await this.#produce(() => this.#sendAnswer(message, visited, receivedAt));
        } while (more);
    }

    /**
     * In one message, say goodbye to the records that peers may cache here but that the current records of the
     * registrations no longer hold, and announce the named services, or all registered services for "all".
     *
     * The goodbye goes out only while the current records are known: without valid interface details nothing is
     * sent.  Every record that left gets a goodbye with TTL 0.  It carries the cache-flush bit only when its type is
     * unique (SRV, TXT, A, AAAA) and the current records hold nothing of its name, type and class (RFC 6762 §10.2);
     * otherwise it carries no bit, so it removes only the old record.
     *
     * Goodbyes are never held by the one-second rule, as in CHIP and matter.js 0.18; RFC 6762 §6 has no such
     * exception.  An announced record that the one-second rule holds back is deferred.  Settles once sent.  A failed
     * send is logged like a failed answer; only the goodbyes are tried again, see {@link #retryGoodbyes}.  Once
     * {@link close} started, rejects with {@link ClosedError}.
     *
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-8.3} RFC 6762 §8.3
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.1} RFC 6762 §10.1
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.2} RFC 6762 §10.2
     */
    async publish(services: string[] | "all") {
        if (this.#isClosing) {
            throw new ClosedError(`Cannot publish: ${this} is closed`);
        }
        this.#usedAt = Time.nowUs;
        await this.#gate.produce(() => this.#sendPublication(services));
    }

    /**
     * Stop sending.  Deferred records are dropped, and so are answers that wait for the mutex; publications that
     * wait still send their goodbyes.  Settles once the last send settled, so it waits for the UDP send in flight.
     */
    async close() {
        this.#isClosing = true;
        this.#deferredTimer?.stop();
        this.#deferred.clear();
        this.#goodbyeRetry?.timer.stop();
        this.#goodbyeRetry = undefined;
        await this.#gate.close();
    }

    /** Run {@link task} in the mutex unless closing; resolves to undefined if it did not run. */
    #produce<T>(task: () => PromiseLike<T | undefined>) {
        if (this.#isClosing) {
            return Promise.resolve(undefined);
        }
        return this.#gate.produce(() => (this.#isClosing ? Promise.resolve(undefined) : task()));
    }

    /**
     * Send the packet for the first service in registration order that has not been visited yet and that has
     * answers.  Resolves to whether services remain.
     */
    #sendAnswer(message: MdnsSocket.Message, visited: Set<string>, receivedAt: number) {
        const view = this.#currentView();
        if (view === undefined) {
            return Promise.resolve(false);
        }
        const { sourceIp, transactionId, queries, answers: knownAnswers } = message;
        const knownKeys = knownAnswers.map(record => ({ key: recordKeyOf(record), ttl: record.ttl }));
        const isKnown = (record: DnsRecord) =>
            knownKeys.some(({ key, ttl }) => ttl > record.ttl / 2 && key === recordKeyOf(record));

        for (const [service, portRecords] of view.byService) {
            if (visited.has(service)) continue;
            visited.add(service);

            const answers = uniqueRecords(queries.flatMap(query => queryRecords(query, portRecords))).filter(
                record => !isKnown(record),
            );
            if (answers.length === 0) continue;
            const additionalRecords = additionalRecordsFor(queries, portRecords, answers).filter(
                record => !isKnown(record),
            );

            const now = Time.nowUs;
            const isUnicast =
                queries.every(query => query.uniCastResponse) &&
                answers.every(answer => this.#sinceCachedMulticast(answer, now) <= answer.ttl / 4);
            let sentAnswers = answers;
            let sentAdditional = additionalRecords;
            if (!isUnicast) {
                sentAnswers = this.#holdBack(
                    answers,
                    now,
                    () => receivedAt,
                    "answer",
                    () => additionalRecords,
                );
                sentAdditional = this.#holdBack(additionalRecords, now, () => receivedAt, "additional", noRecords);
                if (sentAnswers.length === 0) continue;
            }

            const more = [...view.byService.keys()].some(other => !visited.has(other));
            return this.#transmit(
                {
                    messageType: DnsMessageType.Response,
                    transactionId,
                    answers: sendable(sentAnswers, portRecords, isUnicast),
                    additionalRecords: sendable(sentAdditional, portRecords, isUnicast),
                },
                isUnicast ? sourceIp : undefined,
            ).then(
                () => more,
                error => {
                    this.#sendFailed(error, isUnicast ? sourceIp : undefined);
                    return more;
                },
            );
        }

        return Promise.resolve(false);
    }

    /**
     * {@link records} without those the one-second rule holds back.  The address records of one name form one set
     * (RFC 6762 §6.2): when one of them is held, all of them wait for the latest one's second.  A held record is
     * deferred unless a multicast that carried it left at or after its {@link sinceOf} time.  A deferred answer
     * remembers its {@link additionalOf} records, so the deferred packet carries what this packet would have carried.
     */
    #holdBack(
        records: DnsRecord[],
        now: number,
        sinceOf: (record: DnsRecord) => number,
        section: Deferral["section"],
        additionalOf: (record: DnsRecord) => DnsRecord[],
    ) {
        const heldUntil = new Map<DnsRecord, number>();
        for (const record of records) {
            const until = this.#heldUntil(record);
            if (now < until) {
                heldUntil.set(record, until);
            }
        }
        for (const addressSet of addressSetsOf(records)) {
            if (addressSet.some(record => heldUntil.has(record))) {
                const until = Math.max(...addressSet.map(record => this.#heldUntil(record)));
                for (const record of addressSet) {
                    heldUntil.set(record, until);
                }
            }
        }
        return records.filter(record => {
            const until = heldUntil.get(record);
            if (until === undefined) {
                return true;
            }
            const since = sinceOf(record);
            if (!this.#isDeliveredSince(record, since)) {
                this.#defer(record, section, since, additionalOf(record), until);
            }
            return false;
        });
    }

    #sendPublication(services: string[] | "all") {
        const view = this.#currentView();
        if (view === undefined) {
            return Promise.resolve();
        }
        const now = Time.nowUs;
        const goodbye = this.#goodbyesFor(view, now);

        const complete = new Array<DnsRecord>();
        if (!this.#isClosing) {
            for (const [service, records] of view.byService) {
                if (services === "all" || services.includes(service)) {
                    complete.push(...records);
                }
            }
        }
        const announced = this.#holdBack(uniqueRecords(complete), now, () => now, "answer", noRecords);

        if (!goodbye.length && !announced.length) {
            this.#stopGoodbyeRetry();
            return Promise.resolve();
        }
        // RFC 6762 §8.3: announcements carry all records in the answer section.  Goodbyes first: CHIP's resolver
        // applies every TXT record of a packet in order, TTL 0 included, so the new TXT record must come last
        return this.#transmit({
            messageType: DnsMessageType.Response,
            answers: [...goodbye, ...sendable(announced, complete, false)],
        }).then(
            () => this.#settleGoodbyes(),
            error => {
                this.#sendFailed(error);
                this.#settleGoodbyes();
            },
        );
    }

    /**
     * The goodbyes for the records peers may cache here that {@link view} no longer holds, see {@link publish}.
     *
     * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.2} RFC 6762 §10.2
     */
    #goodbyesFor(view: View, now: number) {
        const goodbye = new Array<DnsRecord>();
        for (const [key, { record, cachedUntil }] of this.#peerCache) {
            if (cachedUntil <= now || view.byKey.has(key)) {
                continue;
            }
            goodbye.push({
                ...record,
                ttl: Instant,
                flushCache: DnsRecordType.isUnique(record.recordType) && !view.setKeys.has(setKeyOf(record)),
            });
        }
        return goodbye;
    }

    /**
     * Send the goodbyes again that peers may still need here, with no other publication needed: first a second later,
     * then at twice the interval up to {@link GOODBYE_RETRY_MAXIMUM_INTERVAL}.  A retry that waits keeps its schedule.
     * {@link #settleGoodbyes} ends the retry, and the next one starts at a second again, once no goodbye is needed.
     * Stops on {@link close}.
     */
    #retryGoodbyes() {
        if (this.#isClosing || this.#goodbyeRetry?.timer.isRunning) {
            return;
        }
        const interval = Math.min(
            (this.#goodbyeRetry?.interval ?? MULTICAST_INTERVAL / 2) * 2,
            GOODBYE_RETRY_MAXIMUM_INTERVAL,
        );
        const timer = Time.getTimer("MDNS goodbye retry", Millis(interval), () =>
            this.#gate.run(() => this.#sendPublication([])),
        );
        this.#goodbyeRetry = { timer, interval };
        timer.start();
    }

    /** Try the goodbyes again that peers may still need here, or end the retry when none remain. */
    #settleGoodbyes() {
        const view = this.#currentView();
        if (view !== undefined && this.#goodbyesFor(view, Time.nowUs).length) {
            this.#retryGoodbyes();
        } else {
            this.#stopGoodbyeRetry();
        }
    }

    #stopGoodbyeRetry() {
        this.#goodbyeRetry?.timer.stop();
        this.#goodbyeRetry = undefined;
    }

    /**
     * Send the deferred records whose second has passed, as one packet, under the same {@link #holdBack} decision as
     * the packet that deferred them: a record held again is deferred again, and a record a multicast carried at or
     * after its deferral's {@link Deferral.since} time is not sent.  A record its service no longer publishes is
     * dropped.  A deferred answer brings the additional records its query would have carried.
     */
    #sendDeferred() {
        const now = Time.nowUs;
        const published = this.#currentView()?.byKey ?? new Map<string, DnsRecord>();
        const deferrals = [...this.#deferred];
        this.#deferred.clear();

        const answers = new Array<DnsRecord>();
        const additionalRecords = new Array<DnsRecord>();
        const sinceOf = new Map<DnsRecord, number>();
        const additionalOf = new Map<DnsRecord, DnsRecord[]>();
        for (const [key, { section, since, additionalKeys }] of deferrals) {
            const record = published.get(key);
            if (record === undefined) continue;
            sinceOf.set(record, since);
            if (section === "additional") {
                additionalRecords.push(record);
                continue;
            }
            answers.push(record);
            const additional = new Array<DnsRecord>();
            for (const additionalKey of additionalKeys) {
                const additionalRecord = published.get(additionalKey);
                if (additionalRecord !== undefined) {
                    additional.push(additionalRecord);
                }
            }
            additionalOf.set(record, additional);
        }

        const timeOf = (record: DnsRecord) => sinceOf.get(record) ?? now;
        const sentAnswers = this.#holdBack(answers, now, timeOf, "answer", record => additionalOf.get(record) ?? []);
        const answerKeys = new Set(sentAnswers.map(record => recordKeyOf(record)));
        for (const answer of sentAnswers) {
            for (const additional of additionalOf.get(answer) ?? []) {
                if (!sinceOf.has(additional)) {
                    sinceOf.set(additional, timeOf(answer));
                }
                additionalRecords.push(additional);
            }
        }
        const sentAdditional = this.#holdBack(
            uniqueRecords(additionalRecords).filter(record => !answerKeys.has(recordKeyOf(record))),
            now,
            timeOf,
            "additional",
            noRecords,
        );
        this.#scheduleDeferred();

        if (!sentAnswers.length && !sentAdditional.length) {
            return Promise.resolve();
        }
        const complete = [...published.values()];
        return this.#transmit({
            messageType: DnsMessageType.Response,
            answers: sendable(sentAnswers.length ? sentAnswers : sentAdditional, complete, false),
            additionalRecords: sentAnswers.length ? sendable(sentAdditional, complete, false) : [],
        }).catch(error => this.#sendFailed(error));
    }

    /** When the RFC 6762 §6 rule stops holding {@link record} back; a goodbye counts as a multicast. */
    #heldUntil(record: DnsRecord) {
        return (this.#peerCache.get(recordKeyOf(record))?.lastMulticastAt ?? -Infinity) + MULTICAST_INTERVAL;
    }

    /** Whether a multicast that carried {@link record}, not its goodbye, left at or after {@link since}. */
    #isDeliveredSince(record: DnsRecord, since: number) {
        const entry = this.#peerCache.get(recordKeyOf(record));
        return entry !== undefined && !entry.lastMulticastIsGoodbye && (entry.lastMulticastAt ?? -Infinity) >= since;
    }

    /** Time since the last multicast that carried {@link record}, or infinity when peers may not cache it. */
    #sinceCachedMulticast(record: DnsRecord, now: number) {
        const entry = this.#peerCache.get(recordKeyOf(record));
        if (
            entry === undefined ||
            entry.lastMulticastAt === undefined ||
            entry.lastMulticastIsGoodbye ||
            entry.cachedUntil <= now
        ) {
            return Infinity;
        }
        return now - entry.lastMulticastAt;
    }

    #defer(
        record: DnsRecord,
        section: Deferral["section"],
        since: number,
        additionalRecords: DnsRecord[],
        dueAt: number,
    ) {
        const key = recordKeyOf(record);
        const deferral = this.#deferred.get(key);
        if (deferral === undefined) {
            this.#deferred.set(key, {
                section,
                dueAt,
                since,
                additionalKeys: new Set(additionalRecords.map(additional => recordKeyOf(additional))),
            });
        } else {
            if (section === "answer") {
                deferral.section = "answer";
            }
            deferral.dueAt = Math.max(deferral.dueAt, dueAt);
            deferral.since = Math.min(deferral.since, since);
            for (const additional of additionalRecords) {
                deferral.additionalKeys.add(recordKeyOf(additional));
            }
        }
        this.#scheduleDeferred();
    }

    #scheduleDeferred() {
        this.#deferredTimer?.stop();
        this.#deferredTimer = undefined;
        if (!this.#deferred.size) {
            return;
        }
        const dueAt = Math.min(...[...this.#deferred.values()].map(({ dueAt }) => dueAt));
        this.#deferredTimer = Time.getTimer("MDNS deferred answer", Millis(Math.max(0, dueAt - Time.nowUs)), () =>
            this.#gate.run(() => this.#sendDeferred()),
        ).start();
    }

    /**
     * Logs a failed send, see {@link #multicastMissed}: peers trigger answers and goodbyes are sent again, so only the
     * first failure of an outage logs a notice.  A failed unicast answer logs at debug level and does not start an
     * outage.
     */
    #sendFailed(error: unknown, unicastTarget?: string) {
        if (unicastTarget !== undefined) {
            logger.debug(`Failed to send mDNS response to ${unicastTarget}`, error);
            return;
        }
        this.#multicastMissed(`mDNS messages on interface ${this.name} cannot be sent`, error);
    }

    /**
     * Logs a multicast that failed or reached only some address families.  Both count as one outage, which only a
     * multicast that reached every family ends, see {@link #transmit}.  The first multicast of an outage logs a
     * notice, so a peer that makes the reach change between "some" and failed cannot repeat it.  Later ones log at
     * debug level, and so does every one while closing or after the interface left the listing.
     */
    #multicastMissed(text: string, error: unknown) {
        if (this.#isMulticastOutage || this.#isClosing || !this.#isListed) {
            logger.debug(text, error);
            return;
        }
        this.#isMulticastOutage = true;
        logger.notice(text, error);
    }

    /**
     * Send records, always on this interface: without an interface the socket lists interfaces first, an await
     * before the send.  Resolves to how far the message reached, see {@link MdnsSocket.send}.
     *
     * | Reach                        | Records with TTL     | Goodbyes                                        |
     * |------------------------------|----------------------|-------------------------------------------------|
     * | every address family         | peers may cache them | end the record at once                          |
     * | some address families        | peers may cache them | count as its last multicast, the record stays   |
     * | none (no usable family)      | change nothing       | change nothing                                  |
     * | rejected (error, no address) | change nothing       | change nothing                                  |
     *
     * A message that reached some families counts as reaching each of its records, also those in a datagram that
     * failed on every family: a peer may have got any of them.  A deferred answer that missed a peer then waits for
     * the querier's retry, which RFC 6762 §6 accepts.  A record that stays here gets its goodbye again, see
     * {@link #settleGoodbyes}.
     *
     * A record peers may cache is cached until its TTL after the time the send was called, which is earlier than the
     * wire time by the send latency.  Each record of a multicast, in any section, counts as multicast: RFC 6762 §6
     * limits "a record", whatever section carries it.
     */
    #transmit(message: Partial<DnsMessage> & { messageType: DnsMessageType }, unicastTarget?: string) {
        const sentAt = Time.nowUs;
        const isMulticast = unicastTarget === undefined;
        return this.#owner.socket.send(message, this.name, unicastTarget).then(reach => {
            if (reach === undefined || reach.kind === "none") {
                return reach;
            }
            for (const record of [...(message.answers ?? []), ...(message.additionalRecords ?? [])]) {
                const key = recordKeyOf(record);
                const entry = this.#peerCache.get(key);
                if (record.ttl === 0 && reach.kind === "some") {
                    if (entry !== undefined) {
                        entry.lastMulticastAt = sentAt;
                        entry.lastMulticastIsGoodbye = true;
                    }
                    continue;
                }
                this.#peerCache.set(key, {
                    record,
                    cachedUntil: sentAt + record.ttl,
                    lastMulticastAt: isMulticast ? sentAt : entry?.lastMulticastAt,
                    lastMulticastIsGoodbye: isMulticast ? record.ttl === 0 : entry?.lastMulticastIsGoodbye,
                });
            }
            if (!isMulticast) {
                if (reach.kind === "some") {
                    logger.debug(`Failed to send part of mDNS response to ${unicastTarget}`, reach.failure);
                }
                return reach;
            }
            if (reach.kind === "all") {
                this.#isMulticastOutage = false;
            } else {
                this.#multicastMissed(
                    `mDNS messages on interface ${this.name} reach only some address families`,
                    reach.failure,
                );
            }
            return reach;
        });
    }

    /**
     * The records of the current registrations, also keyed by {@link recordKeyOf}; rebuilt when the registrations,
     * details or host name change.  A rebuild tells the owner, whose socket names depend on the view, unless
     * {@link notify} is false.
     */
    #currentView(notify = true): View | undefined {
        const details = this.#details;
        if (details === undefined) {
            return;
        }
        const { generation, registrations } = this.#owner;
        const hostname = this.#owner.hostnameFor(details);
        const view = this.#view;
        if (
            view?.generation === generation &&
            view.detailsVersion === this.#detailsVersion &&
            view.hostname === hostname
        ) {
            return view;
        }

        const byService = new Map<string, DnsRecord[]>();
        const byKey = new Map<string, DnsRecord>();
        const setKeys = new Set<string>();
        const ownedNames = new Set<string>();
        for (const [service, { generator }] of registrations) {
            const records = generator(this.name, details, hostname);
            byService.set(service, records);
            for (const record of records) {
                byKey.set(recordKeyOf(record), record);
                setKeys.add(setKeyOf(record));
                ownedNames.add(record.name.toLowerCase());
            }
        }
        this.#view = {
            generation,
            detailsVersion: this.#detailsVersion,
            hostname,
            byService,
            byKey,
            setKeys,
            ownedNames,
        };
        if (notify) {
            this.#owner.viewChanged();
        }
        return this.#view;
    }
}

export namespace InterfaceResponder {
    /** What an {@link InterfaceResponder} reads from the {@link MdnsServer} that owns it. */
    export interface Owner {
        readonly socket: MdnsSocket;

        /** The registered services in registration order. */
        readonly registrations: ReadonlyMap<string, { readonly generator: MdnsServer.RecordGenerator }>;

        /** Changes with every change of {@link registrations} and every refresh of a registration. */
        readonly generation: number;

        /** The host name to publish on an interface with {@link details}. */
        hostnameFor(details: NetworkInterfaceDetails): string;

        /** Called after the records of an interface were generated again, so their names may differ. */
        viewChanged(): void;
    }
}

interface PeerCacheEntry {
    record: DnsRecord;
    cachedUntil: number;
    lastMulticastAt?: number;

    /** Whether the last multicast was the record's goodbye, also one that left on only some address families */
    lastMulticastIsGoodbye?: boolean;
}

interface Deferral {
    section: "answer" | "additional";
    dueAt: number;

    /** A multicast that carried the record at or after this time reached the peers; the record is not sent then */
    since: number;

    /** The additional records the packet that deferred an answer would have carried */
    additionalKeys: Set<string>;
}

interface View {
    generation: number;
    detailsVersion: number;
    hostname: string;
    byService: Map<string, DnsRecord[]>;
    byKey: Map<string, DnsRecord>;

    /** The {@link setKeyOf} of each record */
    setKeys: Set<string>;

    /** Lower-cased names of records we own on this interface - used to fast-reject unrelated LAN queries. */
    ownedNames: Set<string>;
}

function noRecords() {
    return new Array<DnsRecord>();
}

/** The address records among {@link records}, grouped by name: the unit of the RFC 6762 §6 hold (§6.2). */
function addressSetsOf(records: DnsRecord[]) {
    const sets = new Map<string, DnsRecord[]>();
    for (const record of records) {
        if (record.recordType === DnsRecordType.A || record.recordType === DnsRecordType.AAAA) {
            const name = record.name.toLowerCase();
            sets.set(name, [...(sets.get(name) ?? []), record]);
        }
    }
    return [...sets.values()];
}

/** The additional records for {@link answers}: none for an address query, else the other non-PTR records. */
function additionalRecordsFor(queries: Question[], records: DnsRecord[], answers: DnsRecord[]) {
    if (queries.every(({ recordType }) => recordType === DnsRecordType.A || recordType === DnsRecordType.AAAA)) {
        return [];
    }
    return records.filter(record => !answers.includes(record) && record.recordType !== DnsRecordType.PTR);
}

type Question = { name: string; recordType: DnsRecordType };

function packetDelay() {
    return Millis(20 + Math.floor(Math.random() * 100));
}

function queryRecords({ name, recordType }: Question, records: DnsRecord[]) {
    // DNS names are case-insensitive per RFC 6762 §16 / RFC 1035 §2.3.3.
    const queryName = name.toLowerCase();
    if (recordType === DnsRecordType.ANY) {
        return records.filter(record => record.name.toLowerCase() === queryName);
    } else {
        return records.filter(record => record.name.toLowerCase() === queryName && record.recordType === recordType);
    }
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
function sendable(sent: DnsRecord[], complete: DnsRecord[], isUnicast: boolean) {
    if (isUnicast) {
        return sent.map(record => (record.flushCache ? { ...record, flushCache: false } : record));
    }

    if (!sent.some(record => record.flushCache)) {
        return sent;
    }

    const sentSizes = setSizes(sent);
    const completeSizes = setSizes(uniqueRecords(complete));

    return sent.map(record =>
        record.flushCache && (sentSizes.get(setKeyOf(record)) ?? 0) < (completeSizes.get(setKeyOf(record)) ?? 0)
            ? { ...record, flushCache: false }
            : record,
    );
}

/** Identifies the record set a record belongs to: RFC 6762 scopes the cache-flush bit to one name, type and class. */
function setKeyOf(record: DnsRecord) {
    return `${record.recordType}-${record.recordClass}-${record.name.toLowerCase()}`;
}

function setSizes(records: DnsRecord[]) {
    const sizes = new Map<string, number>();
    for (const record of records) {
        const key = setKeyOf(record);
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    return sizes;
}

/** {@link records} with each resource record once, in first-seen order. */
function uniqueRecords(records: DnsRecord[]) {
    const seen = new Set<string>();
    return records.filter(record => {
        const key = recordKeyOf(record);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

const recordKeys = new WeakMap<DnsRecord, string>();

/**
 * Identifies a resource record by its name, rrtype, rrclass and rdata, the fields RFC 6762 §10.1 names for a goodbye.
 * Names, in the record and inside PTR and SRV rdata, compare without case (§16); the rdata otherwise compares as
 * encoded on the wire, so TTL and the cache-flush bit do not count.  The one identity for the peer cache, the goodbye
 * and known-answer suppression.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.1} RFC 6762 §10.1
 */
function recordKeyOf(record: DnsRecord) {
    let key = recordKeys.get(record);
    if (key === undefined) {
        key = Bytes.toHex(
            DnsCodec.encodeRecord({
                ...record,
                name: record.name.toLowerCase(),
                value: canonicalValueOf(record),
                ttl: Instant,
                flushCache: false,
            }),
        );
        recordKeys.set(record, key);
    }
    return key;
}

function canonicalValueOf({ recordType, value }: DnsRecord) {
    switch (recordType) {
        case DnsRecordType.PTR:
            return typeof value === "string" ? value.toLowerCase() : value;
        case DnsRecordType.SRV:
            return isSrvValue(value) ? { ...value, target: value.target.toLowerCase() } : value;
        default:
            return value;
    }
}

function isSrvValue(value: unknown): value is SrvRecordValue {
    return typeof value === "object" && value !== null && "target" in value && typeof value.target === "string";
}
