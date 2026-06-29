/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes, DnsRecord, DnsRecordType } from "@matter/main";

export interface DnssdRecordLike {
    recordType: DnsRecordType;
    name: string;
    value: unknown;
}

export interface DnssdParametersLike extends ReadonlyMap<string, string> {
    raw(key: string): Bytes | undefined;
}

export interface DnssdNameLike {
    readonly qname: string;
    readonly parameters: DnssdParametersLike;
    readonly records: Iterable<DnssdRecordLike>;
    readonly isDiscovered: boolean;
    on(observer: NameObserver): void;
    off(observer: NameObserver): void;
}

export interface DnssdNamesFiltersLike {
    add(filter: (record: DnsRecord) => boolean, names: Iterable<string> | "all"): unknown;
    delete(filter: (record: DnsRecord) => boolean): unknown;
}

export interface DiscoveredObservableLike {
    on(observer: DiscoveredObserver): void;
    off(observer: DiscoveredObserver): void;
}

export interface SolicitorLike {
    solicit(solicitation: { name: DnssdNameLike; recordTypes: DnsRecordType[] }): void;
}

export interface DnssdNamesLike {
    readonly filters: DnssdNamesFiltersLike;
    readonly discovered: DiscoveredObservableLike;
    readonly solicitor: SolicitorLike;
    get(qname: string): DnssdNameLike;
    maybeGet(qname: string): DnssdNameLike | undefined;
}

export type DiscoveredObserver = (name: DnssdNameLike) => void;
export type NameObserver = (changes: { name: DnssdNameLike; updated?: unknown[]; deleted?: unknown[] }) => void;
