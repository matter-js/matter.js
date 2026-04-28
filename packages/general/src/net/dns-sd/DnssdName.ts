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
import { Bytes } from "#util/Bytes.js";
import { AsyncObserver, BasicObservable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import type { DnssdNames } from "./DnssdNames.js";
import { DnssdParameters } from "./DnssdParameters.js";

const logger = Logger.get("DnssdName");

/**
 * Grace factor applied to record TTLs so timing jitter doesn't cause premature expiry and spurious re-queries.
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
    #parameters?: DnssdParameters;
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

    get parameters(): DnssdParameters {
        if (this.#parameters === undefined) {
            const raw = new Map<string, Bytes>();
            for (const record of this.#records.values()) {
                if (record.recordType !== DnsRecordType.TXT) {
                    continue;
                }
                for (const entry of record.value as Bytes[]) {
                    const bytes = Bytes.of(entry);
                    // RFC 6763 §6.5: ignore zero-length entry.
                    if (bytes.byteLength === 0) {
                        continue;
                    }
                    // 0x3D = '='. RFC 6763 §6.4: split on the first '=' (later '=' bytes, e.g. base64 padding, belong to the value).
                    const eqIndex = bytes.indexOf(0x3d);
                    // RFC 6763 §6.4: ignore entry with empty key.
                    if (eqIndex === 0) {
                        continue;
                    }
                    const key = eqIndex === -1 ? Bytes.toString(bytes) : Bytes.toString(bytes.subarray(0, eqIndex));
                    // RFC 6763 §6.4: first occurrence wins on duplicates.
                    if (raw.has(key)) {
                        continue;
                    }
                    raw.set(key, eqIndex === -1 ? new Uint8Array(0) : bytes.subarray(eqIndex + 1));
                }
            }
            this.#parameters = new DnssdParameters(raw);
        }
        return this.#parameters;
    }

    get isDiscovered() {
        return !!this.#recordCount;
    }

    installRecord(record: DnsRecord<any>, options?: DnssdName.InstallOptions) {
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

        const at = options?.installedAt ?? Time.nowMs;
        const isHostRecord = record.recordType === DnsRecordType.A || record.recordType === DnsRecordType.AAAA;
        const recordWithExpire = {
            ...record,
            installedAt: at,
            expiresAt: at + Millis(Math.round(record.ttl * this.#context.ttlGraceFactor)),
            ...(isHostRecord
                ? { sourceIntf: record.recordType === DnsRecordType.AAAA ? options?.sourceIntf : undefined }
                : {}),
        } as DnssdName.Record;

        this.#records.set(key, recordWithExpire);

        if (record.recordType === DnsRecordType.TXT) {
            this.#parameters = undefined;
        }

        this.#context.registerForExpiration(recordWithExpire);

        // Keep hostname alive as long as any SRV references it
        if (record.recordType === DnsRecordType.SRV && !this.#dependencies?.has(key)) {
            const dependency = this.#context.get((record.value as SrvRecordValue).target);

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

        if (ifOlderThan !== undefined && recordWithExpire.installedAt >= ifOlderThan) {
            return;
        }

        this.#records.delete(key);
        this.#recordCount--;

        if (record.recordType === DnsRecordType.TXT) {
            this.#parameters = undefined;
        }

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
                const keys = (record.value as Bytes[]).map(entry => Bytes.toHex(entry));
                keys.sort();
                return `${record.recordType} ${keys.join(" ")}`;
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
         * Multiplier applied to TTL when computing record expiry.  Always provided by {@link DnssdNames}.
         */
        ttlGraceFactor: number;
    }

    export interface Expiration {
        installedAt: Timestamp;
        expiresAt: Timestamp;
    }

    export interface PointerRecord extends DnsRecord<string>, Expiration {
        recordType: DnsRecordType.PTR;
    }

    export interface HostRecord extends DnsRecord<string>, Expiration {
        recordType: DnsRecordType.A | DnsRecordType.AAAA;

        /** Receive interface — populated only for AAAA, needed to form %zone for fe80 addresses. */
        sourceIntf: string | undefined;
    }

    export interface InstallOptions {
        /** Explicit install timestamp; defaults to `Time.nowMs`.  Set by the staged-replay path. */
        installedAt?: Timestamp;

        /** Interface on which the record was received.  Honoured only for AAAA records. */
        sourceIntf?: string;
    }

    export interface ServiceRecord extends DnsRecord<SrvRecordValue>, Expiration {
        recordType: DnsRecordType.SRV;
    }

    export interface TextRecord extends DnsRecord<Bytes[]>, Expiration {
        recordType: DnsRecordType.TXT;
    }

    export type Record = PointerRecord | ServiceRecord | HostRecord | TextRecord;

    export interface Changes {
        name: DnssdName;
        updated?: Record[];
        deleted?: Record[];
    }
}
