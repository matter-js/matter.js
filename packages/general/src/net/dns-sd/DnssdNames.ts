/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type DnsRecord, DnsRecordType } from "#codec/DnsCodec.js";
import { ImplementationError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Minutes, Seconds } from "#time/TimeUnit.js";
import { Entropy } from "#util/Entropy.js";
import { Lifetime } from "#util/Lifetime.js";
import { Observable, ObserverGroup } from "#util/Observable.js";
import { Scheduler } from "#util/Scheduler.js";
import { DEFAULT_TTL_GRACE_FACTOR, DnssdName } from "./DnssdName.js";
import { QueryMulticaster } from "./DnssdSolicitor.js";
import { MdnsSocket } from "./MdnsSocket.js";

const STAGED_IP_RECORDS_MAX_HOSTS = 250;
const STAGED_IP_RECORDS_MIN_HOSTS = 200;

// Footprints split into two socket owners: the filters' static service types (replaced on filter change) and the
// dynamically tracked names (added/removed one at a time as discovery creates/expires them).
const FILTER_NAMES_OWNER = "dnssd-filters";
const TRACKED_NAMES_OWNER = "dnssd-tracked";

/**
 * Names collected via DNS-SD.
 *
 * TODO - API is designed to support Avahi, Bonjour etc. but current implementation is tied to local MDNS
 */
export class DnssdNames {
    readonly #socket: MdnsSocket;
    readonly #lifetime: Lifetime;
    readonly #entropy: Entropy;
    readonly #filters = new Set<(record: DnsRecord) => boolean>();
    readonly #filterNames = new Map<(record: DnsRecord) => boolean, string[] | "all">();
    #filtersFacade?: DnssdNames.Filters;
    readonly #solicitor: QueryMulticaster;
    readonly #observers = new ObserverGroup();
    readonly #names = new Map<string, DnssdName>();
    readonly #expiration: Scheduler<DnssdName.Record>;
    readonly #discovered = new Observable<[name: DnssdName]>();
    readonly #goodbyeProtectionWindow: Duration;
    readonly #minTtl: Duration;
    readonly #ttlGraceFactor: number;

    /**
     * A/AAAA records for hostnames that don't yet have a DnssdName; replayed when the name is later created via
     * SRV dependency.  Expired entries are pruned by a timer and filtered on consumption.
     */
    readonly #stagedIpRecords = new Map<string, { record: DnsRecord; receivedAt: Timestamp; sourceIntf?: string }[]>();
    readonly #stagedIpExpirationTimer: Timer;
    // Points at handleMessage's newlyDiscovered list while a packet is being processed so replay-triggered
    // discoveries join the same end-of-packet emit batch
    #currentBatch?: DnssdName[];

    constructor({
        socket,
        lifetime = Lifetime.process,
        entropy,
        filter,
        filterNames,
        goodbyeProtectionWindow,
        minTtl,
        ttlGraceFactor,
    }: DnssdNames.Context) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns names");
        this.#entropy = entropy;
        if (filter) {
            this.#addFilter(filter, filterNames);
        }
        this.#solicitor = new QueryMulticaster(this);
        this.#goodbyeProtectionWindow = goodbyeProtectionWindow ?? DnssdNames.defaults.goodbyeProtectionWindow;
        this.#minTtl = minTtl ?? DnssdNames.defaults.minTtl;
        const effectiveGraceFactor = ttlGraceFactor ?? DEFAULT_TTL_GRACE_FACTOR;
        if (!(effectiveGraceFactor >= 1)) {
            throw new ImplementationError(`ttlGraceFactor must be >= 1.0, got ${effectiveGraceFactor}`);
        }
        this.#ttlGraceFactor = effectiveGraceFactor;

        this.#expiration = new Scheduler({
            name: "expiration scheduler",
            lifetime: this.#lifetime,
            timeOf: a => a.expiresAt,
            run: record => {
                const discoveryName = this.maybeGet(record.name);
                if (discoveryName) {
                    discoveryName.deleteRecord(record);
                }
            },
        });

        this.#nameContext = {
            delete: name => {
                const known = this.maybeGet(name.qname);
                if (known === name) {
                    this.#delete(name);
                }
            },
            registerForExpiration: record => this.#expiration.add(record),
            unregisterForExpiration: record => this.#expiration.delete(record),
            get: qname => this.get(qname),
            ttlGraceFactor: this.#ttlGraceFactor,
        };
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));

        // Prune staged IP records on a timer so per-message handling stays hot-path free
        this.#stagedIpExpirationTimer = Time.getPeriodicTimer(
            "Staged IP record expiration",
            Minutes(1),
            this.#pruneStagedIpRecords.bind(this),
        );
        this.#stagedIpExpirationTimer.utility = true;
        this.#stagedIpExpirationTimer.start();

        // Publish initial filter footprints (registers "all" when no filter narrows ingress)
        this.#updateFilterNames();
    }

    #pruneStagedIpRecords() {
        if (this.#stagedIpRecords.size === 0) {
            return;
        }
        const now = Time.nowMs;
        for (const [key, staged] of this.#stagedIpRecords) {
            const live = staged.filter(
                ({ record, receivedAt }) => now - receivedAt < record.ttl * this.#ttlGraceFactor,
            );
            if (live.length === 0) {
                this.#stagedIpRecords.delete(key);
            } else if (live.length !== staged.length) {
                this.#stagedIpRecords.set(key, live);
            }
        }
        // Evict oldest-touched hostnames down to the low-water mark once the cache grows past the high-water mark
        if (this.#stagedIpRecords.size > STAGED_IP_RECORDS_MAX_HOSTS) {
            const keys = this.#stagedIpRecords.keys();
            while (this.#stagedIpRecords.size > STAGED_IP_RECORDS_MIN_HOSTS) {
                const { value, done } = keys.next();
                if (done) break;
                this.#stagedIpRecords.delete(value);
            }
        }
    }

    #handleMessage(message: MdnsSocket.Message) {
        let newlyDiscovered: DnssdName[] | undefined;

        try {
            newlyDiscovered = this.#processMessage(message);
        } finally {
            this.#currentBatch = undefined;
        }

        // Same-message goodbyes may have reverted discovery
        for (const name of newlyDiscovered ?? []) {
            if (name.isDiscovered) {
                this.#discovered.emit(name);
            }
        }
    }

    #processMessage(message: MdnsSocket.Message): DnssdName[] {
        const records = [...message.answers, ...message.additionalRecords];
        const filtered = new Set(records);
        const sourceIntf = message.sourceIntf;
        let goodbyesBefore: undefined | Timestamp;

        // Collect newly discovered names so we can emit after all records in the message are processed.  This ensures
        // that observers see the complete record set (e.g. both SRV and TXT) rather than partial state mid-message.
        const newlyDiscovered: DnssdName[] = [];
        this.#currentBatch = newlyDiscovered;

        // Flip true when any record in this packet was accepted (filter match or dependency hit).  Staging only
        // considers packets that also carry something we already care about, otherwise unrelated LAN A/AAAA
        // announcements could poison the cache and attach wrong addresses to a later Matter SRV target.
        let packetRelevant = false;

        /**
         * Handles a record we've decided we're interested in.
         */
        const handleRecord = (record: DnsRecord) => {
            filtered.delete(record);
            packetRelevant = true;
            const name = this.get(record.name);
            if (record.ttl) {
                if (record.ttl < this.#minTtl) {
                    record = { ...record, ttl: this.#minTtl };
                }
                const wasDiscovered = name.isDiscovered;
                name.installRecord(record, { sourceIntf });
                if (!wasDiscovered && name.isDiscovered) {
                    newlyDiscovered.push(name);
                }
            } else {
                if (goodbyesBefore === undefined) {
                    goodbyesBefore = Timestamp(Time.nowMs - this.#goodbyeProtectionWindow);
                }
                name.deleteRecord(record, goodbyesBefore);
            }
        };

        // Process all records explicitly accepted by the filter
        for (const record of records) {
            if (this.#filters.size > 0) {
                let accepted = false;
                for (const f of this.#filters) {
                    if (f(record)) {
                        accepted = true;
                        break;
                    }
                }
                if (!accepted) {
                    continue;
                }
            }

            handleRecord(record);
        }

        // Filtered records may be relevant to us if they are referenced by services, e.g. SRV targets become relevant.
        // Iteratively process until the set of filtered records does not change.
        let filteredBeforePass: number;
        do {
            filteredBeforePass = filtered.size;
            for (const record of filtered) {
                if (!this.has(record.name)) {
                    continue;
                }

                handleRecord(record);
            }
        } while (filteredBeforePass > filtered.size);

        // Honour goodbye (ttl=0) for already-staged hostnames regardless of packetRelevant: eviction only
        // touches entries we previously admitted under the gate, so a stray goodbye cannot poison anything new.
        for (const record of filtered) {
            if (record.recordType !== DnsRecordType.A && record.recordType !== DnsRecordType.AAAA) {
                continue;
            }
            if (record.ttl !== 0) {
                continue;
            }
            const key = record.name.toLowerCase();
            if (this.#names.has(key)) {
                continue;
            }
            const staged = this.#stagedIpRecords.get(key);
            if (staged === undefined) {
                continue;
            }
            const remaining = staged.filter(
                s => !(s.record.recordType === record.recordType && s.record.value === record.value),
            );
            if (remaining.length === 0) {
                this.#stagedIpRecords.delete(key);
            } else {
                this.#stagedIpRecords.set(key, remaining);
            }
        }

        // Stage A/AAAA for unknown hostnames — replayed when a later SRV creates the name.
        // packetRelevant gate prevents unrelated LAN traffic from poisoning the cache.
        if (packetRelevant) {
            for (let record of filtered) {
                if (record.recordType !== DnsRecordType.A && record.recordType !== DnsRecordType.AAAA) {
                    continue;
                }
                if (record.ttl === 0) {
                    continue;
                }
                const key = record.name.toLowerCase();
                if (this.#names.has(key)) {
                    continue;
                }

                if (record.ttl < this.#minTtl) {
                    record = { ...record, ttl: this.#minTtl };
                }
                const staged = this.#stagedIpRecords.get(key) ?? [];
                const existing = staged.findIndex(
                    s => s.record.recordType === record.recordType && s.record.value === record.value,
                );
                if (existing === -1) {
                    staged.push({ record, receivedAt: Time.nowMs, sourceIntf });
                } else {
                    staged[existing] = { record, receivedAt: Time.nowMs, sourceIntf };
                }
                // Delete + set moves the key to the tail of the Map so prune evicts least-recently-touched first
                this.#stagedIpRecords.delete(key);
                this.#stagedIpRecords.set(key, staged);
            }
        }

        return newlyDiscovered;
    }

    /**
     * Test for existence of name.
     */
    has(name: string) {
        return this.#names.has(name.toLowerCase());
    }

    /**
     * Retrieve the {@link DnssdName} for {@link name}.
     *
     * This will create the name if it does not exist, and if you do not add an observer then it will not automatically
     * delete if there are no records.  So if you may not use the record test for existence with {@link has} first.
     */
    get(qname: string): DnssdName {
        let name = this.maybeGet(qname);
        if (name === undefined) {
            name = new DnssdName(qname, this.#nameContext);
            const key = qname.toLowerCase();
            this.#names.set(key, name);
            this.#socket.addRelevantName(TRACKED_NAMES_OWNER, key);

            const staged = this.#stagedIpRecords.get(key);
            if (staged !== undefined) {
                this.#stagedIpRecords.delete(key);
                const now = Time.nowMs;
                for (const { record, receivedAt, sourceIntf } of staged) {
                    // Preserve original TTL and receivedAt so expiry math and goodbye-protection recovery both
                    // reference the real discovery time rather than the replay moment
                    if (now - receivedAt < record.ttl * this.#ttlGraceFactor) {
                        name.installRecord(record, { sourceIntf, installedAt: receivedAt });
                    }
                }
                if (name.isDiscovered) {
                    if (this.#currentBatch !== undefined) {
                        this.#currentBatch.push(name);
                    } else {
                        this.#discovered.emit(name);
                    }
                }
            }
        }
        return name;
    }

    /**
     * Retrieve the {@link DnssdName} if known.
     */
    maybeGet(name: string) {
        return this.#names.get(name.toLowerCase());
    }

    /**
     * All currently discovered {@link DnssdName}s.
     */
    get discoveredNames(): Iterable<DnssdName> {
        const names = this.#names;
        return (function* () {
            for (const name of names.values()) {
                if (name.isDiscovered) {
                    yield name;
                }
            }
        })();
    }

    #delete(name: DnssdName) {
        const key = name.qname.toLowerCase();
        this.#names.delete(key);
        this.#socket.removeRelevantName(TRACKED_NAMES_OWNER, key);
    }

    /**
     * Wait for all workers and close all names.
     */
    async close() {
        using _closing = this.#lifetime.closing();
        this.#socket.unregisterRelevantNames(FILTER_NAMES_OWNER);
        this.#socket.unregisterRelevantNames(TRACKED_NAMES_OWNER);
        this.#stagedIpExpirationTimer.stop();
        this.#stagedIpRecords.clear();
        this.#observers.close();
        await this.#expiration.close();
        for (const name of this.#names.values()) {
            await name.close();
            this.#delete(name);
        }
        await this.#solicitor.close();
    }

    /**
     * Dynamic ingress filters. Records accepted by ANY registered filter are processed; with no filters, all records
     * are accepted. Pass the names a filter accepts (e.g. its service types) so the socket can drop irrelevant packets
     * before decoding them; a filter added without names disables that optimization (the socket accepts everything).
     */
    get filters(): DnssdNames.Filters {
        if (this.#filtersFacade === undefined) {
            const filters = this.#filters;
            this.#filtersFacade = {
                add: (filter, names) => this.#addFilter(filter, names),
                delete: filter => this.#deleteFilter(filter),
                has: filter => filters.has(filter),
                get size() {
                    return filters.size;
                },
                [Symbol.iterator]: () => filters[Symbol.iterator](),
            };
        }
        return this.#filtersFacade;
    }

    #addFilter(filter: (record: DnsRecord) => boolean, names?: Iterable<string> | "all") {
        this.#filters.add(filter);
        this.#filterNames.set(filter, names === undefined || names === "all" ? "all" : [...names]);
        this.#updateFilterNames();
    }

    #deleteFilter(filter: (record: DnsRecord) => boolean) {
        const deleted = this.#filters.delete(filter);
        if (deleted) {
            this.#filterNames.delete(filter);
            this.#updateFilterNames();
        }
        return deleted;
    }

    /**
     * Publish the union of the filters' declared service types to the socket. Tracked names (SRV-target hostnames and
     * the like) are registered separately and incrementally via {@link DnssdNames.get}/{@link #delete}. Registers
     * "all" — disabling the pre-filter — whenever a filter was added without names, or no filter is registered (every
     * record is accepted).
     */
    #updateFilterNames() {
        if (this.#filters.size === 0) {
            this.#socket.registerRelevantNames(FILTER_NAMES_OWNER, "all");
            return;
        }
        const names = new Set<string>();
        for (const filterNames of this.#filterNames.values()) {
            if (filterNames === "all") {
                this.#socket.registerRelevantNames(FILTER_NAMES_OWNER, "all");
                return;
            }
            for (const name of filterNames) {
                names.add(name);
            }
        }
        this.#socket.registerRelevantNames(FILTER_NAMES_OWNER, names);
    }

    get socket() {
        return this.#socket;
    }

    /**
     * Emits when a {@link DnssdName} is first discovered.
     */
    get discovered() {
        return this.#discovered;
    }

    /**
     * Shared solicitor.
     *
     * We offer solicitation in this object so there is not redundant solicitation across interested parties.
     */
    get solicitor() {
        return this.#solicitor;
    }

    get entropy() {
        return this.#entropy;
    }

    #nameContext: DnssdName.Context;
}

export namespace DnssdNames {
    export interface Context {
        socket: MdnsSocket;
        lifetime?: Lifetime.Owner;
        entropy: Entropy;

        /**
         * Initial ingress filter. Additional filters may be added via {@link DnssdNames.filters}.
         *
         * Observed names are considered relevant even if filtered here.
         */
        filter?: (record: DnsRecord) => boolean;

        /**
         * Names the initial {@link filter} accepts (e.g. its DNS-SD service types), driving the socket's pre-decode
         * relevance filter. Pass `"all"` (or omit) only when interest cannot be enumerated — note that disables the
         * pre-filter for the whole socket (every packet is fully decoded again), so prefer concrete names.
         */
        filterNames?: Iterable<string> | "all";

        /**
         * The interval after discovering a record for which we ignore goodbyes.
         *
         * This serves as protection for out-of-order messages when a device expires then broadcasts the same record
         * in a very short amount of time.
         */
        goodbyeProtectionWindow?: Duration;

        /**
         * Minimum TTL for PTR records.
         */
        minTtl?: Duration;

        /**
         * Multiplier applied to record TTL when computing expiry to tolerate timing jitter.  Must be >= 1.0.
         * Defaults to {@link DEFAULT_TTL_GRACE_FACTOR}.
         */
        ttlGraceFactor?: number;
    }

    /**
     * Set-like facade over the ingress filters that also captures the names each filter accepts (see
     * {@link DnssdNames.filters}).
     */
    export interface Filters {
        /**
         * Register an ingress filter together with the names it accepts. `names` drives the socket's pre-decode
         * relevance filter, so it is required: pass the filter's DNS-SD service types (e.g. `_meshcop._udp.local`).
         *
         * **Avoid `"all"` unless unavoidable.** It does not merely disable the optimization for this scanner — it
         * disables it for the WHOLE socket, forcing every inbound mDNS packet to be fully decoded again (the exact
         * cost the pre-filter exists to avoid). Only use it when the filter's interest genuinely cannot be enumerated.
         */
        add(filter: (record: DnsRecord) => boolean, names: Iterable<string> | "all"): void;
        delete(filter: (record: DnsRecord) => boolean): boolean;
        has(filter: (record: DnsRecord) => boolean): boolean;
        readonly size: number;
        [Symbol.iterator](): IterableIterator<(record: DnsRecord) => boolean>;
    }

    export const defaults = {
        goodbyeProtectionWindow: Seconds(1),
        minTtl: Seconds(15), // This is the value that Apple uses
    };
}
