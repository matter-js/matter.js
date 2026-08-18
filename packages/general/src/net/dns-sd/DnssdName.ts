/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsRecord, DnsRecordType, SrvRecordValue } from "#codec/DnsCodec.js";
import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import type { Duration } from "#time/Duration.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
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

const MAX_PORT = 0xffff;

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
    #unavailableServiceReported?: boolean;

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
            // Process newest TXT records first so an updated record's keys win over the not-yet-expired older copy;
            // first-wins (RFC 6763 §6.4) then applies to entries within each record in their wire order.
            const txtRecords = new Array<DnssdName.TextRecord>();
            for (const record of this.#records.values()) {
                if (record.recordType === DnsRecordType.TXT) {
                    txtRecords.push(record);
                }
            }
            txtRecords.sort((a, b) => b.installedAt - a.installedAt);
            for (const record of txtRecords) {
                for (const entry of record.value) {
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

        if (record.recordType === DnsRecordType.SRV && !isAvailableService(record.value)) {
            if (!this.#unavailableServiceReported) {
                this.#unavailableServiceReported = true;
                logger.info(
                    `Ignoring SRV record for "${this.qname}" that designates no available service`,
                    Diagnostic.dict({ target: record.value.target, port: record.value.port }),
                );
            }
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

        // Retire what this record supersedes only once we know we are keeping it, and only what predates it, so a
        // responder announcing a whole record set at once does not leave us holding just the last of it.  The record
        // being installed is excluded by key as well as by time: the copy it replaces is still in #records here, and
        // retiring that copy would leave a scheduled deletion that later resolves to this key.
        if (record.flushCache && isUniqueRecordType(record.recordType)) {
            this.#expireOthersBefore(record.recordType, at, key);
        }

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

        return true;
    }

    /**
     * The record installed under {@link record}'s key, with that key, or undefined if we hold none.
     */
    #installedFor(record: DnsRecord): [key: string, record: DnssdName.Record] | undefined {
        const key = keyOf(record);
        if (key !== undefined) {
            const installed = this.#records.get(key);
            if (installed !== undefined) {
                return [key, installed];
            }
        }

        this.#deleteIfUnused();
    }

    /**
     * Shorten a record's remaining lifetime to the context's eviction delay.  Never extends it.
     */
    expireRecord(record: DnsRecord) {
        const installed = this.#installedFor(record);
        if (installed === undefined) {
            return;
        }

        this.#retire(...installed);
    }

    #expireOthersBefore(recordType: DnsRecordType, before: Timestamp, exceptKey: string) {
        for (const [key, record] of this.#records) {
            if (key !== exceptKey && record.recordType === recordType && record.installedAt < before) {
                this.#retire(key, record);
            }
        }
    }

    #retire(key: string, current: DnssdName.Record) {
        const delay = this.#context.evictionDelay;
        const expiresAt = Timestamp(Time.nowMs + delay);
        if (current.expiresAt <= expiresAt) {
            return;
        }

        const expiring = { ...current, ttl: delay, expiresAt };
        this.#context.registerForExpiration(expiring);
        this.#context.unregisterForExpiration(current);
        this.#records.set(key, expiring);
    }

    deleteRecord(record: DnsRecord) {
        const installed = this.#installedFor(record);
        if (installed === undefined) {
            return;
        }

        const [key, recordWithExpire] = installed;

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

/**
 * Determine whether an SRV record designates a service that is actually reachable.
 *
 * A target of "." (decoded as an empty name) means the service is not available at this domain per RFC 2782, and a
 * port of 0 designates a placeholder registration that claims a name without offering a service per RFC 6763 §8.
 * Ports outside the 16-bit range cannot be dialed at all.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc2782} "The format of the SRV RR"
 * @see {@link https://www.rfc-editor.org/rfc/rfc6763#section-8} "Flagship Naming"
 */
function isAvailableService({ target, port }: SrvRecordValue) {
    if (target === "" || target === ".") {
        return false;
    }

    return Number.isInteger(port) && port > 0 && port <= MAX_PORT;
}

/**
 * Whether a single responder owns every record of {@link recordType} for a given name, which is what lets a
 * cache-flush record retire the others.  A DNS-SD service-type PTR enumerates every instance offering that service,
 * so it is shared and never qualifies.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.2} RFC 6762 §10.2
 * @see {@link https://www.rfc-editor.org/rfc/rfc6763#section-4.1} RFC 6763 §4.1
 */
export function isUniqueRecordType(recordType: DnsRecordType) {
    return UNIQUE_RECORD_TYPES.has(recordType);
}

const UNIQUE_RECORD_TYPES: ReadonlySet<DnsRecordType> = new Set([
    DnsRecordType.SRV,
    DnsRecordType.TXT,
    DnsRecordType.A,
    DnsRecordType.AAAA,
]);

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

        /**
         * How long a record survives once something supersedes it.  Always provided by {@link DnssdNames}.
         */
        evictionDelay: Duration;
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
