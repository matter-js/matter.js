/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecord, DnsRecordType, SrvRecordValue } from "#codec/DnsCodec.js";
import { Logger } from "#log/Logger.js";
import { Time } from "#time/Time.js";
import type { Timestamp } from "#time/Timestamp.js";
import { AsyncObserver, BasicObservable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import type { DnssdNames } from "./DnssdNames.js";

const logger = Logger.get("DnssdName");

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

        const recordWithExpire = { ...record, expiresAt: Time.nowMs + record.ttl } as DnssdName.Record;

        this.#records.set(key, recordWithExpire);

        this.#context.registerForExpiration(recordWithExpire);

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

        if (ifOlderThan !== undefined && recordWithExpire.expiresAt - recordWithExpire.ttl >= ifOlderThan) {
            return;
        }

        this.#records.delete(key);
        this.#recordCount--;

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
    }
}

export namespace DnssdName {
    export interface Context {
        delete(name: DnssdName): void;
        registerForExpiration(record: Record): void;
        unregisterForExpiration(record: Record): void;
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
