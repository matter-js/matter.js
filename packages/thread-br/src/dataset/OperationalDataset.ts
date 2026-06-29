/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { type BasicTlvEntry, BasicTlv } from "../tlv/BasicTlvCodec.js";
import { MeshCopTlvType } from "./meshcopTlvTypes.js";
import { SecurityPolicy } from "./SecurityPolicy.js";

/**
 * Decoded Thread Operational Dataset.
 *
 * Each named accessor mirrors a MeshCoP TLV defined in {@link MeshCopTlvType}.
 * Unknown TLVs survive a decode/encode round-trip via {@link unknownTlvs}.
 *
 * Datasets returned by {@link OperationalDataset.decode} also carry hidden
 * replay state so {@link OperationalDataset.encode} can reproduce the source
 * bytes verbatim when no field has been mutated — preserving non-canonical
 * encodings (legacy 1-byte CHANNEL forms, vendor-specific orderings) emitted
 * by real Border Routers.
 */
export interface OperationalDataset {
    channel?: number;
    panId?: number;
    extPanId?: Uint8Array;
    networkName?: string;
    pskc?: Uint8Array;
    networkKey?: Uint8Array;
    meshLocalPrefix?: Uint8Array;
    securityPolicy?: SecurityPolicy;
    activeTimestamp?: Uint8Array;
    pendingTimestamp?: Uint8Array;
    delayTimer?: number;
    channelMask?: Uint8Array;
    unknownTlvs: Array<{ type: number; value: Uint8Array }>;
    raw: Uint8Array;
}

export namespace OperationalDataset {
    /**
     * Decodes a Thread Operational Dataset from either raw bytes or a hex string.
     *
     * Accepts a whitespace-tolerant hex string (whitespace is stripped before
     * parsing) or a `Uint8Array` of MeshCoP TLV bytes. Unknown TLVs survive the
     * round-trip via {@link OperationalDataset.unknownTlvs}. Throws on malformed
     * input (bad hex or TLV structure violations).
     */
    export function decode(input: Uint8Array | string): OperationalDataset {
        const blob = typeof input === "string" ? Bytes.of(Bytes.fromHex(input.replace(/\s+/g, ""))) : input;
        const entries = BasicTlv.walk(blob);
        const unknownTlvs = new Array<{ type: number; value: Uint8Array }>();
        const originalTlvs = entries.map(e => ({ type: e.type, value: e.value.slice() }));
        const ds: OperationalDataset = {
            unknownTlvs,
            raw: blob.slice(),
        };
        ORIGINAL_TLVS.set(ds, originalTlvs);

        for (const entry of entries) {
            applyKnownTlvToDataset(ds, entry, unknownTlvs);
        }

        return ds;
    }

    /**
     * Encode a Thread Operational Dataset to MeshCoP TLV bytes.
     *
     * Datasets produced by {@link decode} are re-encoded with replay fidelity:
     * unmodified known TLVs reproduce their original bytes (preserving non-canonical
     * encodings from real Border Routers), while mutated fields are re-encoded
     * canonically. Datasets constructed directly (without a prior `decode`) are
     * always encoded in canonical form.
     *
     * @param ds - Dataset to encode; may be a decoded or manually constructed object.
     * @returns MeshCoP TLV byte sequence.
     */
    export function encode(ds: OperationalDataset): Uint8Array {
        const originals = ORIGINAL_TLVS.get(ds);
        if (originals !== undefined) {
            return encodeWithReplay(ds, originals);
        }
        return BasicTlv.encode(canonicalEntries(ds));
    }

    /**
     * Return a copy of the dataset with `pskc` and `networkKey` cleared.
     *
     * Safe to log or expose via the public API — secret material is removed
     * while all other fields (channel, network name, timestamps, etc.) are retained.
     *
     * @param ds - Source dataset; not mutated.
     * @returns Shallow copy with secret fields set to `undefined`.
     */
    export function redact(ds: OperationalDataset): OperationalDataset {
        return { ...ds, pskc: undefined, networkKey: undefined };
    }
}

/**
 * Replay state for {@link OperationalDataset.encode}. Held off-interface so the
 * public type stays a plain dataset shape; the entry is reclaimed automatically
 * when the dataset is garbage-collected.
 */
const ORIGINAL_TLVS = new WeakMap<OperationalDataset, ReadonlyArray<BasicTlvEntry>>();

function applyKnownTlvToDataset(
    ds: OperationalDataset,
    entry: BasicTlvEntry,
    unknownTlvs: Array<{ type: number; value: Uint8Array }>,
): void {
    switch (entry.type) {
        case MeshCopTlvType.CHANNEL:
            ds.channel = decodeChannel(entry.value);
            break;
        case MeshCopTlvType.PANID:
            if (entry.value.length !== 2) {
                throw new Error(`PANID TLV must be 2 bytes, got ${entry.value.length}`);
            }
            ds.panId = (entry.value[0] << 8) | entry.value[1];
            break;
        case MeshCopTlvType.EXTPANID:
            if (entry.value.length !== 8) {
                throw new Error(`EXTPANID TLV must be 8 bytes, got ${entry.value.length}`);
            }
            ds.extPanId = entry.value.slice();
            break;
        case MeshCopTlvType.NETWORK_NAME:
            ds.networkName = new TextDecoder("utf-8").decode(entry.value);
            break;
        case MeshCopTlvType.PSKC:
            ds.pskc = entry.value.slice();
            break;
        case MeshCopTlvType.NETWORK_KEY:
            if (entry.value.length !== 16) {
                throw new Error(`NETWORK_KEY TLV must be 16 bytes, got ${entry.value.length}`);
            }
            ds.networkKey = entry.value.slice();
            break;
        case MeshCopTlvType.MESH_LOCAL_PREFIX:
            if (entry.value.length !== 8) {
                throw new Error(`MESH_LOCAL_PREFIX TLV must be 8 bytes, got ${entry.value.length}`);
            }
            ds.meshLocalPrefix = entry.value.slice();
            break;
        case MeshCopTlvType.SECURITY_POLICY:
            ds.securityPolicy = SecurityPolicy.decode(entry.value);
            break;
        case MeshCopTlvType.ACTIVE_TIMESTAMP:
            if (entry.value.length !== 8) {
                throw new Error(`ACTIVE_TIMESTAMP TLV must be 8 bytes, got ${entry.value.length}`);
            }
            ds.activeTimestamp = entry.value.slice();
            break;
        case MeshCopTlvType.PENDING_TIMESTAMP:
            if (entry.value.length !== 8) {
                throw new Error(`PENDING_TIMESTAMP TLV must be 8 bytes, got ${entry.value.length}`);
            }
            ds.pendingTimestamp = entry.value.slice();
            break;
        case MeshCopTlvType.DELAY_TIMER:
            if (entry.value.length !== 4) {
                throw new Error(`DELAY_TIMER TLV must be 4 bytes, got ${entry.value.length}`);
            }
            ds.delayTimer = (entry.value[0] << 24) | (entry.value[1] << 16) | (entry.value[2] << 8) | entry.value[3];
            break;
        case MeshCopTlvType.CHANNEL_MASK:
            ds.channelMask = entry.value.slice();
            break;
        default:
            unknownTlvs.push({ type: entry.type, value: entry.value.slice() });
            break;
    }
}

function encodeWithReplay(ds: OperationalDataset, originals: ReadonlyArray<BasicTlvEntry>): Uint8Array {
    const seenKnownTypes = new Set<number>();
    const unknownCursor = new Map<number, number>();
    const out = new Array<BasicTlvEntry>();
    const scratch: OperationalDataset = { unknownTlvs: [], raw: EMPTY_BYTES };

    for (const original of originals) {
        const known = KNOWN_TLV_HANDLERS.get(original.type);
        if (known !== undefined) {
            seenKnownTypes.add(original.type);
            const canonical = known.encodeCurrent(ds);
            if (canonical === undefined) continue;
            // Compare named values rather than bytes so non-canonical encodings (e.g. the
            // legacy 1-byte CHANNEL form) replay unchanged when the caller hasn't mutated.
            applyKnownTlvToDataset(scratch, original, scratch.unknownTlvs);
            if (known.equalsCurrent(ds, scratch)) {
                out.push({ type: original.type, value: original.value });
            } else {
                out.push({ type: original.type, value: canonical });
            }
            continue;
        }
        const start = unknownCursor.get(original.type) ?? 0;
        const matchIdx = ds.unknownTlvs.findIndex(
            (u, i) => i >= start && u.type === original.type && Bytes.areEqual(u.value, original.value),
        );
        if (matchIdx === -1) continue;
        unknownCursor.set(original.type, matchIdx + 1);
        out.push({ type: original.type, value: original.value });
    }

    for (const known of KNOWN_TLV_HANDLERS.values()) {
        if (seenKnownTypes.has(known.type)) continue;
        const canonical = known.encodeCurrent(ds);
        if (canonical === undefined) continue;
        out.push({ type: known.type, value: canonical });
    }

    return BasicTlv.encode(out);
}

const EMPTY_BYTES = new Uint8Array();

function canonicalEntries(ds: OperationalDataset): BasicTlvEntry[] {
    const out = new Array<BasicTlvEntry>();
    for (const known of KNOWN_TLV_HANDLERS.values()) {
        const canonical = known.encodeCurrent(ds);
        if (canonical === undefined) continue;
        out.push({ type: known.type, value: canonical });
    }
    for (const u of ds.unknownTlvs) {
        out.push({ type: u.type, value: u.value.slice() });
    }
    return out;
}

/**
 * Each handler erases its field type behind a closure so the heterogeneous
 * registry can live in a single Map without per-field casts at the call site.
 */
interface KnownTlvHandler {
    type: number;
    /** Returns the canonical encoding of the named accessor, or undefined when unset. */
    encodeCurrent(ds: OperationalDataset): Uint8Array | undefined;
    /** Whether ds[field] structurally equals other[field]. Used for replay decisions. */
    equalsCurrent(ds: OperationalDataset, other: OperationalDataset): boolean;
}

function handler<K extends keyof OperationalDataset>(
    type: number,
    field: K,
    encodeValue: (value: OperationalDataset[K] & {}) => Uint8Array,
    equals: (a: OperationalDataset[K] & {}, b: OperationalDataset[K] & {}) => boolean,
): KnownTlvHandler {
    return {
        type,
        encodeCurrent(ds) {
            const value = ds[field];
            if (value === undefined) return undefined;
            return encodeValue(value);
        },
        equalsCurrent(ds, other) {
            const a = ds[field];
            const b = other[field];
            if (a === undefined || b === undefined) return a === b;
            return equals(a, b);
        },
    };
}

const eqNumber = (a: number, b: number): boolean => a === b;
const eqString = (a: string, b: string): boolean => a === b;
const eqBytes = (a: Uint8Array, b: Uint8Array): boolean => Bytes.areEqual(a, b);
const eqSecurityPolicy = (a: SecurityPolicy, b: SecurityPolicy): boolean =>
    a.rotationTime === b.rotationTime && a.flags === b.flags;

const KNOWN_TLV_HANDLERS: Map<number, KnownTlvHandler> = (() => {
    const list: KnownTlvHandler[] = [
        handler(
            MeshCopTlvType.CHANNEL,
            "channel",
            value => new Uint8Array([0x00, (value >> 8) & 0xff, value & 0xff]),
            eqNumber,
        ),
        handler(MeshCopTlvType.PANID, "panId", value => new Uint8Array([(value >> 8) & 0xff, value & 0xff]), eqNumber),
        handler(MeshCopTlvType.EXTPANID, "extPanId", value => value, eqBytes),
        handler(MeshCopTlvType.NETWORK_NAME, "networkName", value => new TextEncoder().encode(value), eqString),
        handler(MeshCopTlvType.PSKC, "pskc", value => value, eqBytes),
        handler(MeshCopTlvType.NETWORK_KEY, "networkKey", value => value, eqBytes),
        handler(MeshCopTlvType.MESH_LOCAL_PREFIX, "meshLocalPrefix", value => value, eqBytes),
        handler(
            MeshCopTlvType.SECURITY_POLICY,
            "securityPolicy",
            value => SecurityPolicy.encode(value),
            eqSecurityPolicy,
        ),
        handler(MeshCopTlvType.ACTIVE_TIMESTAMP, "activeTimestamp", value => value, eqBytes),
        handler(MeshCopTlvType.PENDING_TIMESTAMP, "pendingTimestamp", value => value, eqBytes),
        handler(
            MeshCopTlvType.DELAY_TIMER,
            "delayTimer",
            value => new Uint8Array([(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]),
            eqNumber,
        ),
        handler(MeshCopTlvType.CHANNEL_MASK, "channelMask", value => value, eqBytes),
    ];
    list.sort((a, b) => a.type - b.type);
    const map = new Map<number, KnownTlvHandler>();
    for (const h of list) map.set(h.type, h);
    return map;
})();

/**
 * Real-world OpenThread datasets sometimes encode CHANNEL as a single byte
 * (the channel number directly) instead of the spec-conformant 3-byte form
 * (channel-page:1 + channel:2). Both forms are accepted on decode.
 */
function decodeChannel(value: Uint8Array): number {
    if (value.length === 1) {
        return value[0];
    }
    if (value.length === 3) {
        return (value[1] << 8) | value[2];
    }
    throw new Error(`CHANNEL TLV must be 1 or 3 bytes, got ${value.length}`);
}
