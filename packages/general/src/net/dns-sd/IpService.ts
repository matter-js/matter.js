/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecordType, SrvRecordValue } from "#codec/DnsCodec.js";
import { Diagnostic } from "#log/Diagnostic.js";
import { AddressLifespan, ServerAddressUdp } from "#net/ServerAddress.js";
import { ServerAddressSet } from "#net/ServerAddressSet.js";
import { Duration } from "#time/Duration.js";
import { Time } from "#time/Time.js";
import { Abort } from "#util/Abort.js";
import { AsyncObservable, AsyncObservableValue, ObserverGroup } from "#util/Observable.js";
import { DnssdName } from "./DnssdName.js";
import { DnssdNames } from "./DnssdNames.js";
import { IpServiceStatus } from "./IpServiceStatus.js";

/**
 * A service addressable by IP that updates as {@link DnssdNames} change.
 */
export class IpService {
    readonly #name: DnssdName;
    readonly #via: string;
    readonly #names: DnssdNames;
    readonly #observers = new ObserverGroup(this);
    readonly #services = new Map<string, Service>();
    readonly #changed = new AsyncObservable<[]>();
    readonly #addresses = ServerAddressSet<ServerAddressUdp>();
    #status = new IpServiceStatus(this);
    #notified?: Promise<void>;

    constructor(name: string, via: string, names: DnssdNames) {
        this.#name = names.get(name);
        this.#names = names;
        this.#via = Diagnostic.via(via);
        this.#observers.on(this.#name, this.#onServiceChanged);

        for (const record of this.#name.records) {
            const service = serviceOf(record);
            if (!service) {
                continue;
            }

            this.#updateService(record.ttl, service);
        }
    }

    /**
     * The DNS-SD name.
     */
    get name() {
        return this.#name;
    }

    /**
     * Other DNS-SD names.
     */
    get names() {
        return this.#names;
    }

    /**
     * Identifier used for logging.
     */
    get via() {
        return this.#via;
    }

    /**
     * Status details of the service.
     */
    get status() {
        return this.#status;
    }

    /**
     * Release resources.
     */
    async close() {
        this.#observers.close();
        await this.#status.close();
        if (this.#notified) {
            await this.#notified;
        }
    }

    /**
     * Known addresses.
     */
    get addresses() {
        return this.#addresses;
    }

    /**
     * Values from TXT records.
     */
    get parameters() {
        return this.#name.parameters;
    }

    /**
     * Emits when the service changes.
     */
    get changed() {
        return this.#changed;
    }

    map<T>(fn: (addr: ServerAddressUdp) => T): T[] {
        return [...this.addresses].map(fn);
    }

    /**
     * Stream address updates, starting with initial set of addresses.
     *
     * Outputs addresses in priority order so the stream may be used directly for establishing new connections.
     *
     * If no addresses are present, triggers discovery using standard MDNS backoff schedule.
     */
    async *addressChanges({
        abort,
        order = ServerAddressSet.compareDesirability,
    }: {
        abort?: AbortSignal;
        order?: ServerAddressSet.Comparator;
        ipv4?: boolean;
    } = {}): AsyncGenerator<{ kind: "add" | "delete"; address: ServerAddressUdp }> {
        let knownAddresses = new Set<ServerAddressUdp>();

        // Implement change detection
        const dirty = new AsyncObservableValue<[isDirty: boolean]>();
        using _changed = this.changed.use(() => dirty.emit(true));

        loop: while (true) {
            // Collect and order addresses; do not use return from resolve() to avoid race condition with dirty
            // observation
            dirty.emit(false);
            const addresses = ServerAddressSet(this.addresses, order);

            // Enqueue new addresses
            let changes = new Array<IpService.AddressChange>();
            const oldKnownAddresses = knownAddresses;
            knownAddresses = new Set();
            for (const address of addresses) {
                knownAddresses.add(address);

                if (oldKnownAddresses.has(address)) {
                    oldKnownAddresses.delete(address);
                    continue;
                }

                changes.push({ kind: "add", address });
            }

            // Enqueue deleted addresses
            if (oldKnownAddresses.size) {
                const deletedAddresses = [...oldKnownAddresses.values()];
                const deletes = deletedAddresses.map(address => ({ kind: "delete", address }) as const);
                changes = [...deletes, ...changes];
            }

            // Output
            for (const change of changes) {
                yield change;

                // Abort if aborted
                if (Abort.is(abort)) {
                    return;
                }

                // Restart if changed
                if (dirty.value) {
                    continue loop;
                }
            }

            // All addresses emitted; wait for change
            await Abort.race(abort, dirty);
            if (Abort.is(abort)) {
                return;
            }
        }
    }

    #onServiceChanged = async ({ updated, deleted }: DnssdName.Changes) => {
        if (updated) {
            for (const record of updated) {
                const service = serviceOf(record);
                if (service) {
                    this.#updateService(record.ttl, service);
                }
            }
        }

        if (deleted) {
            for (const record of deleted) {
                const service = serviceOf(record);
                if (service) {
                    this.#deleteService(service);
                }
            }
        }
    };

    #updateService(ttl: Duration, { target, port, priority, weight }: SrvRecordValue) {
        const key = hostKeyOf(target, port);
        let service = this.#services.get(key);

        if (service) {
            service.discoveredAt = Time.nowMs;
            service.ttl = ttl;
            service.port = port;
            service.priority = priority;
            service.weight = weight;
            return;
        }

        service = {
            name: this.#names.get(target),
            discoveredAt: Time.nowMs,
            ttl,
            port,
            priority,
            weight,
            onChange: changes => this.#onAddressChanged(service!, changes),
        };

        this.#observers.on(service.name, service.onChange);

        this.#onAddressChanged(service, { name: service.name, updated: [...service.name.records] });

        this.#services.set(key, service);
    }

    #deleteService({ target, port }: SrvRecordValue) {
        const key = hostKeyOf(target, port);
        const service = this.#services.get(key);

        if (!service) {
            return;
        }

        this.#services.delete(key);

        this.#observers.off(service.name, service.onChange);

        this.#onAddressChanged(service, { name: service.name, deleted: [...service.name.records] });

        return;
    }

    #onAddressChanged = (service: Service, { updated, deleted }: DnssdName.Changes) => {
        if (updated) {
            for (const record of updated) {
                const addr = addressOf(record);
                if (addr) {
                    this.#updateAddress(service, addr);
                }
            }
        }
        if (deleted) {
            for (const record of deleted) {
                const addr = addressOf(record);
                if (addr) {
                    this.#deleteAddress(service, addr);
                }
            }
        }
    };

    #updateAddress(service: Service, ip: string) {
        const address: ServerAddressUdp = { type: "udp", ip, port: service.port };

        if (this.#addresses.has(address)) {
            return;
        }

        this.#addresses.add(address);

        // Set status to reachable any time we add a new address
        this.#status.isReachable = true;

        this.#notify();
    }

    #deleteAddress(service: Service, ip: string) {
        const address: ServerAddressUdp = { type: "udp", ip, port: service.port };

        if (!this.#addresses.has(address)) {
            return;
        }

        this.#addresses.delete(address);

        this.#notify();
    }

    #notify = () => {
        if (this.#notified) {
            return;
        }

        // We notify asynchronously so changes coalesce
        this.#notified = this.#emitNotification();
    };

    async #emitNotification() {
        await Time.sleep("discovery service coalescence", 0);
        this.#notified = undefined;
        await this.changed.emit();
    }
}

export namespace IpService {
    export interface AddressChange {
        kind: "add" | "delete";
        address: ServerAddressUdp;
    }
}

interface Service extends AddressLifespan {
    name: DnssdName;
    priority: number;
    weight: number;
    port: number;
    onChange(changes: DnssdName.Changes): void;
}

function serviceOf(record: DnssdName.Record) {
    if (record.recordType !== DnsRecordType.SRV) {
        return;
    }

    return record.value;
}

function hostKeyOf(name: string, port: number) {
    return `${name}:${port}`;
}

function addressOf(record: DnssdName.Record) {
    if (record.recordType !== DnsRecordType.A && record.recordType !== DnsRecordType.AAAA) {
        return;
    }
    return record.value;
}
