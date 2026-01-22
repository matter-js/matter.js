/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecord } from "#codec/DnsCodec.js";
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

    constructor({ socket, lifetime = Lifetime.process, entropy, filter }: DnssdNames.Context) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns client");
        this.#entropy = entropy;
        this.#filter = filter;
        this.#solicitor = new QueryMulticaster(this);
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));

        this.#expiration = new Scheduler({
            name: "expiration scheduler",
            lifetime: this.#lifetime,
            timeOf: a => {
                return a.expiresAt;
            },
            run: record => {
                const discoveryName = this.#names.get(record.name);
                if (discoveryName) {
                    discoveryName.deleteRecord(record);
                }
            },
        });
    }

    #handleMessage(message: MdnsSocket.Message) {
        for (const record of [...message.answers, ...message.additionalRecords]) {
            if (this.#filter && !this.#filter(record)) {
                continue;
            }

            const name = this.get(record.name);
            if (record.ttl > 0) {
                const wasDiscovered = name.isDiscovered;
                name.installRecord(record);
                if (!wasDiscovered && name.isDiscovered) {
                    this.#discovered.emit(name);
                }
            } else {
                name.deleteRecord(record);
            }
        }
    }

    /**
     * Test for existence of name.
     */
    has(name: string) {
        name = name.toLowerCase();
        return this.#names.has(name);
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
            this.#names.set(qname, name);
        }
        return name;
    }

    /**
     * Retrieve the {@link DnssdName} if known.
     */
    maybeGet(name: string) {
        name = name.toLowerCase();
        return this.#names.get(name);
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
            this.#names.delete(name.qname);
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
            const known = this.#names.get(name.qname);
            if (known === name) {
                this.#names.delete(name.qname);
            }
        },

        registerForExpiration: record => {
            this.#expiration.add(record);
        },

        unregisterForExpiration: record => {
            this.#expiration.delete(record);
        },
    };
}

export namespace DnssdNames {
    export interface Context {
        socket: MdnsSocket;
        lifetime?: Lifetime.Owner;
        entropy: Entropy;
        filter?: (record: DnsRecord) => boolean;
    }
}
