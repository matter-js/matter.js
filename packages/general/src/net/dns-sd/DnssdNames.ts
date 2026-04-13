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
import { Millis, Minutes, Seconds } from "#time/TimeUnit.js";
import { Entropy } from "#util/Entropy.js";
import { Lifetime } from "#util/Lifetime.js";
import { Observable, ObserverGroup } from "#util/Observable.js";
import { Scheduler } from "#util/Scheduler.js";
import { DEFAULT_TTL_GRACE_FACTOR, DnssdName } from "./DnssdName.js";
import { QueryMulticaster } from "./DnssdSolicitor.js";
import { MdnsSocket } from "./MdnsSocket.js";

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
    readonly #stagedIpRecords = new Map<string, { record: DnsRecord; receivedAt: Timestamp }[]>();
    readonly #stagedIpExpirationTimer: Timer;

    constructor({
        socket,
        lifetime = Lifetime.process,
        entropy,
        filter,
        goodbyeProtectionWindow,
        minTtl,
        ttlGraceFactor,
    }: DnssdNames.Context) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns names");
        this.#entropy = entropy;
        if (filter) {
            this.#filters.add(filter);
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
        ).start();
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
    }

    #handleMessage(message: MdnsSocket.Message) {
        const records = [...message.answers, ...message.additionalRecords];
        const filtered = new Set(records);
        let goodbyesBefore: undefined | Timestamp;

        // Collect newly discovered names so we can emit after all records in the message are processed.  This ensures
        // that observers see the complete record set (e.g. both SRV and TXT) rather than partial state mid-message.
        const newlyDiscovered: DnssdName[] = [];

        /**
         * Handles a record we've decided we're interested in.
         */
        const handleRecord = (record: DnsRecord) => {
            filtered.delete(record);
            const name = this.get(record.name);
            if (record.ttl) {
                if (record.ttl < this.#minTtl) {
                    record = { ...record, ttl: this.#minTtl };
                }
                const wasDiscovered = name.isDiscovered;
                name.installRecord(record);
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
        // So iteratively process until the set of filtered records does not change
        let filteredBeforePass = records.length;
        while (filteredBeforePass > filtered.size) {
            filteredBeforePass = filtered.size;
            for (const record of filtered) {
                if (!this.has(record.name)) {
                    continue;
                }

                handleRecord(record);
            }
        }

        // Stage A/AAAA records for unknown hostnames so they can be replayed when a later SRV creates the name
        for (let record of filtered) {
            if (
                (record.recordType === DnsRecordType.A || record.recordType === DnsRecordType.AAAA) &&
                record.ttl > 0 &&
                !this.has(record.name)
            ) {
                if (record.ttl < this.#minTtl) {
                    record = { ...record, ttl: this.#minTtl };
                }
                const key = record.name.toLowerCase();
                let staged = this.#stagedIpRecords.get(key);
                if (staged === undefined) {
                    staged = [];
                    this.#stagedIpRecords.set(key, staged);
                }
                // Dedup by IP value so repeated announcements don't grow the array unbounded
                const existing = staged.findIndex(
                    s => s.record.recordType === record.recordType && s.record.value === record.value,
                );
                if (existing === -1) {
                    staged.push({ record, receivedAt: Time.nowMs });
                } else {
                    staged[existing] = { record, receivedAt: Time.nowMs };
                }
            }
        }

        // Emit after all records installed so observers see complete state; re-check because same-message goodbyes
        // may have reverted discovery
        for (const name of newlyDiscovered) {
            if (name.isDiscovered) {
                this.#discovered.emit(name);
            }
        }
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

            const staged = this.#stagedIpRecords.get(key);
            if (staged !== undefined) {
                this.#stagedIpRecords.delete(key);
                const now = Time.nowMs;
                for (const { record, receivedAt } of staged) {
                    // age/grace cancels installRecord's grace re-application, preserving original expiry target
                    const remainingTtl = record.ttl - (now - receivedAt) / this.#ttlGraceFactor;
                    if (remainingTtl > 0) {
                        name.installRecord({ ...record, ttl: Millis(remainingTtl) });
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
        this.#names.delete(name.qname.toLowerCase());
    }

    /**
     * Wait for all workers and close all names.
     */
    async close() {
        using _closing = this.#lifetime.closing();
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
     * Dynamic ingress filters. Records accepted by ANY registered filter are processed.
     * If no filters are registered, all records are accepted.
     */
    get filters() {
        return this.#filters;
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

    export const defaults = {
        goodbyeProtectionWindow: Seconds(1),
        minTtl: Seconds(15), // This is the value that Apple uses
    };
}
