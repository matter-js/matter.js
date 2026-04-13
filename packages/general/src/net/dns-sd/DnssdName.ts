/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecord, DnsRecordType, SrvRecordValue } from "#codec/DnsCodec.js";
import { Logger } from "#log/Logger.js";
import { Time } from "#time/Time.js";
import type { Timestamp } from "#time/Timestamp.js";
import { Millis } from "#time/TimeUnit.js";
import { AsyncObserver, BasicObservable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import type { DnssdNames } from "./DnssdNames.js";

const logger = Logger.get("DnssdName");

/**
 * Default grace factor applied to record TTLs to tolerate timing jitter.
 *
 * Mirrors the legacy MdnsClient behavior — without this, records expire slightly too early under load,
 * causing unnecessary re-queries and transient "not discovered" states.
 *
 * Configurable per {@link DnssdName.Context} so tests can disable (set to 1.0) when virtual time caps interfere.
 */
export const DEFAULT_TTL_GRACE_FACTOR = 1.05;

/**
 * Manages records associated with a single DNS-SD qname.
 *
 * Every DNS-SD qname of interest has a 1:1 relationship with a single instance of this class in the context of a
 * {@link DnssdNames}.  We therefore can use the qname or {@link DnssdName} interchangeably.
 *
 * An {@link DnssdName} is created when a new name is discovered or requested by another component.  The name
 * automatically deletes when there are no longer observers or unexpired records.
 */
export class DnssdName extends BasicObservable<[changes: DnssdName.Changes], MaybePromise> {
    #context: DnssdName.Context;
    #records = new Map<string, DnssdName.Record>();
    #recordCount = 0;
    #changes?: Map<string, { kind: "update" | "delete"; record: DnssdName.Record }>;
    #notified?: Promise<void>;
    #maybeDeleting?: Promise<void>;
    #parameters?: Map<string, string>;
    #dependencies?: Map<string, DnssdName>;
    #nullObserver?: () => void;

    constructor(
        readonly qname: string,
        context: DnssdName.Context,
    ) {
        super(e => logger.error(`Unhandled error in observer for DNS name "${qname}":`, e));
        this.#context = context;
    }

    override off(observer: AsyncObserver<[]>) {
        super.off(observer);
        this.#deleteIfUnused();
    }

    async close() {
        if (this.#notified) {
            await this.#notified;
        }
        if (this.#maybeDeleting) {
            await this.#maybeDeleting;
        }
    }

    get records() {
        return this.#records.values();
    }

    get parameters() {
        if (this.#parameters === undefined) {
            this.#parameters = new Map();
        }
        return this.#parameters;
    }

    get isDiscovered() {
        return !!this.#recordCount;
    }

    installRecord(record: DnsRecord<any>) {
        // For TXT records, extract the standard DNS-SD k/v's
        if (record.recordType === DnsRecordType.TXT) {
            const entries = record.value;
            for (const entry of entries) {
                const pos = entry.indexOf("=");
                if (pos === -1) {
                    this.parameters.set(entry, "");
                } else {
                    this.parameters.set(entry.slice(0, pos), entry.slice(pos + 1));
                }
            }
        }

        const key = keyOf(record);
        if (key === undefined) {
            this.#deleteIfUnused();
            return false;
        }

        const oldRecord = this.#records.get(key);
        if (oldRecord) {
            this.#context.unregisterForExpiration(oldRecord);
        } else {
            this.#recordCount++;
        }

        const graceFactor = this.#context.ttlGraceFactor ?? DEFAULT_TTL_GRACE_FACTOR;
        const recordWithExpire = {
            ...record,
            expiresAt: Time.nowMs + Millis(Math.round(record.ttl * graceFactor)),
        } as DnssdName.Record;

        this.#records.set(key, recordWithExpire);

        this.#context.registerForExpiration(recordWithExpire);

        // For PTR records, add a dependency
        if (record.recordType === DnsRecordType.SRV && !this.#dependencies?.has(key)) {
            const dependency = this.#context.get((record.value as SrvRecordValue).target);

            // We use the "null observer" to mark the name as observed; we don't actually react to changes because we
            // want to observe so long as its a dependency
            dependency.on((this.#nullObserver ??= () => undefined));

            (this.#dependencies ??= new Map()).set(key, dependency);
        }

        this.#notify("update", key, recordWithExpire);
    }

    deleteRecord(record: DnsRecord, ifOlderThan?: Timestamp) {
        const key = keyOf(record);
        if (key === undefined) {
            this.#deleteIfUnused();
            return;
        }

        const recordWithExpire = this.#records?.get(key);
        if (!recordWithExpire) {
            this.#deleteIfUnused();
            return;
        }

        // Recover the original discovery timestamp by subtracting the grace-adjusted TTL we added in installRecord
        const graceFactor = this.#context.ttlGraceFactor ?? DEFAULT_TTL_GRACE_FACTOR;
        if (
            ifOlderThan !== undefined &&
            recordWithExpire.expiresAt - Math.round(recordWithExpire.ttl * graceFactor) >= ifOlderThan
        ) {
            return;
        }

        this.#records.delete(key);
        this.#recordCount--;

        const dependency = this.#dependencies?.get(key);
        if (dependency) {
            this.#dependencies!.delete(key);
            dependency.off(this.#nullObserver!);
        }

        this.#context.unregisterForExpiration(recordWithExpire);

        if (this.#deleteIfUnused()) {
            return;
        }

        this.#notify("delete", key, recordWithExpire);
    }

    /**
     * Delete if unused.
     *
     * This is async so we assess whether deletion is appropriate after a batch of updates.
     */
    #deleteIfUnused() {
        if (this.isObserved || this.isDiscovered) {
            return false;
        }

        if (this.#maybeDeleting) {
            return true;
        }

        const maybeDelete = async () => {
            this.#maybeDeleting = undefined;

            if (this.isObserved || this.isDiscovered) {
                return;
            }

            this.#context.delete(this);
        };

        this.#maybeDeleting = maybeDelete();

        return true;
    }

    /**
     * Notification of observers.
     *
     * This is async so we coalesce changes into a single notification.
     */
    #notify(kind: "update" | "delete", key: string, record: DnssdName.Record) {
        if (this.#changes === undefined) {
            this.#changes = new Map();
        }
        this.#changes.set(key, { kind, record });

        if (this.#notified) {
            return;
        }

        const notify = async () => {
            while (this.#changes?.size) {
                const changes: DnssdName.Changes = { name: this };
                for (const { kind, record } of this.#changes.values()) {
                    const key: "updated" | "deleted" = `${kind}d`;
                    const list = changes[key];
                    if (list === undefined) {
                        changes[key] = [record];
                    } else {
                        list.push(record);
                    }
                }
                this.#changes.clear();
                await this.emit(changes);
            }
            this.#notified = undefined;
        };

        this.#notified = notify();
    }
}

function keyOf(record: DnsRecord): string | undefined {
    switch (record.recordType) {
        case DnsRecordType.A:
        case DnsRecordType.AAAA:
        case DnsRecordType.PTR:
            if (typeof record.value === "string") {
                return `${record.recordType} ${record.value}`;
            }
            break;

        case DnsRecordType.SRV:
            if (typeof record.value === "object") {
                const srv = record.value as SrvRecordValue;
                return `${record.recordType} ${srv.target}:${srv.port}`;
            }
            break;

        case DnsRecordType.TXT:
            if (Array.isArray(record.value)) {
                return `${record.recordType} ${record.value.sort().join(" ")}`;
            }
            break;
    }
}

export namespace DnssdName {
    export interface Context {
        delete(name: DnssdName): void;
        registerForExpiration(record: Record): void;
        unregisterForExpiration(record: Record): void;
        get(qname: string): DnssdName;

        /**
         * Multiplier applied to TTL when computing record expiry.
         *
         * Defaults to {@link DEFAULT_TTL_GRACE_FACTOR} when omitted.
         */
        ttlGraceFactor?: number;
    }

    export interface Expiration {
        expiresAt: Timestamp;
    }

    export interface PointerRecord extends DnsRecord<string>, Expiration {
        recordType: DnsRecordType.PTR;
    }

    export interface HostRecord extends DnsRecord<string>, Expiration {
        recordType: DnsRecordType.A | DnsRecordType.AAAA;
    }

    export interface ServiceRecord extends DnsRecord<SrvRecordValue>, Expiration {
        recordType: DnsRecordType.SRV;
    }

    export type Record = PointerRecord | ServiceRecord | HostRecord;

    export interface Changes {
        name: DnssdName;
        updated?: Record[];
        deleted?: Record[];
    }
}
