/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecord } from "#codec/DnsCodec.js";
import { Duration } from "#time/Duration.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Seconds } from "#time/TimeUnit.js";
import { Entropy } from "#util/Entropy.js";
import { Lifetime } from "#util/Lifetime.js";
import { Observable, ObserverGroup } from "#util/Observable.js";
import { Scheduler } from "#util/Scheduler.js";
import { DnssdName } from "./DnssdName.js";
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
    readonly #filter?: (record: DnsRecord) => boolean;
    readonly #solicitor: QueryMulticaster;
    readonly #observers = new ObserverGroup();
    readonly #names = new Map<string, DnssdName>();
    readonly #expiration: Scheduler<DnssdName.Record>;
    readonly #discovered = new Observable<[name: DnssdName]>();
    readonly #goodbyeProtectionWindow: Duration;
    readonly #minTtl: Duration;

    constructor({
        socket,
        lifetime = Lifetime.process,
        entropy,
        filter,
        goodbyeProtectionWindow,
        minTtl,
    }: DnssdNames.Context) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns names");
        this.#entropy = entropy;
        this.#filter = filter;
        this.#solicitor = new QueryMulticaster(this);
        this.#goodbyeProtectionWindow = goodbyeProtectionWindow ?? DnssdNames.defaults.goodbyeProtectionWindow;
        this.#minTtl = minTtl ?? DnssdNames.defaults.minTtl;
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));

        this.#expiration = new Scheduler({
            name: "expiration scheduler",
            lifetime: this.#lifetime,
            timeOf: a => {
                return a.expiresAt;
            },
            run: record => {
                const discoveryName = this.maybeGet(record.name);
                if (discoveryName) {
                    discoveryName.deleteRecord(record);
                }
            },
        });
    }

    #handleMessage(message: MdnsSocket.Message) {
        const records = [...message.answers, ...message.additionalRecords];
        const filtered = new Set(records);
        let goodbyesBefore: undefined | Timestamp;

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
                    this.#discovered.emit(name);
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
            if (this.#filter && !this.#filter(record)) {
                continue;
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
            this.#names.set(qname.toLowerCase(), name);
        }
        return name;
    }

    /**
     * Retrieve the {@link DnssdName} if known.
     */
    maybeGet(name: string) {
        return this.#names.get(name.toLowerCase());
    }

    #delete(name: DnssdName) {
        this.#names.delete(name.qname.toLowerCase());
    }

    /**
     * Wait for all workers and close all names.
     */
    async close() {
        using _closing = this.#lifetime.closing();
        this.#observers.close();
        await this.#expiration.close();
        for (const name of this.#names.values()) {
            await name.close();
            this.#delete(name);
        }
        await this.#solicitor.close();
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

    #nameContext: DnssdName.Context = {
        delete: name => {
            const known = this.maybeGet(name.qname);
            if (known === name) {
                this.#delete(name);
            }
        },

        registerForExpiration: record => {
            this.#expiration.add(record);
        },

        unregisterForExpiration: record => {
            this.#expiration.delete(record);
        },

        get: qname => {
            return this.get(qname);
        },
    };
}

export namespace DnssdNames {
    export interface Context {
        socket: MdnsSocket;
        lifetime?: Lifetime.Owner;
        entropy: Entropy;

        /**
         * Identify relevant records coming in on the wire for inclusion in the name set.
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
    }

    export const defaults = {
        goodbyeProtectionWindow: Seconds(1),
        minTtl: Seconds(15), // This is the value that Apple uses
    };
}
