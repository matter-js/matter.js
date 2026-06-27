/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";

const DNS_HEADER_SIZE = 12;

/**
 * DNS labels shared across so many service types they carry no relevance signal, so the footprint of a name is its
 * rightmost label that is not one of these.
 */
const FOOTPRINT_STOPLIST = new Set(["_tcp", "_udp", "local", "_sub"]);

// FNV-1a 32-bit hash (Fowler–Noll–Vo). A fast non-cryptographic hash used to turn a DNS label into an integer so
// footprint lookup is O(1) map membership with no per-packet string allocation. These two values are the algorithm's
// standard 32-bit constants: FNV_OFFSET is the offset basis (starting value) and FNV_PRIME is multiplied in each step
// (`hash = (hash XOR byte) * FNV_PRIME`). Non-crypto is fine here — a collision only causes a false keep (the packet is
// decoded and then dropped by the real gates), never a false drop.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

// Bound on compression-pointer hops while scanning a single name; exceeding it means a malformed or looping packet,
// which we keep (defer to the decoder) rather than risk a wrong drop.
const MAX_NAME_POINTERS = 128;

function foldAsciiByte(byte: number) {
    return byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
}

/** FNV-1a over a case-folded label, reading raw packet bytes (no allocation). */
function hashLabelBytes(source: Uint8Array, start: number, length: number) {
    let hash = FNV_OFFSET;
    for (let i = 0; i < length; i++) {
        hash = Math.imul(hash ^ foldAsciiByte(source[start + i]), FNV_PRIME);
    }
    return hash >>> 0;
}

/**
 * Hash of a name's footprint: its rightmost non-stoplist label (RFC 6763 service type or hostname), case-folded.
 * Returns undefined when a name contains only stoplist labels. ASCII footprints only; {@link hashLabelBytes} folds
 * packet bytes the same way so the two hashes agree.
 */
function footprintHash(name: string): number | undefined {
    const labels = name.toLowerCase().split(".");
    for (let i = labels.length - 1; i >= 0; i--) {
        const label = labels[i];
        if (label.length === 0 || FOOTPRINT_STOPLIST.has(label)) {
            continue;
        }
        let hash = FNV_OFFSET;
        for (let j = 0; j < label.length; j++) {
            hash = Math.imul(hash ^ foldAsciiByte(label.charCodeAt(j)), FNV_PRIME);
        }
        return hash >>> 0;
    }
    return undefined;
}

/**
 * Decides whether an inbound mDNS packet is worth decoding, so the socket can drop irrelevant traffic before the
 * expensive full {@link DnsCodec.decode}.
 *
 * Interested components register the DNS names they care about; the filter reduces each to its distinctive label
 * footprint and, per packet, scans only the packet's name structure (skipping RDATA) for a match. It is a conservative
 * superset: a false keep is free (the packet falls through to the real gates), a false drop would break discovery and
 * must never happen, so any structural uncertainty or hash collision yields a keep.
 *
 * Footprints are reference-counted across owners and maintained incrementally, so adding or removing a single tracked
 * name (e.g. a discovered hostname) is O(1) rather than rebuilding the whole set per packet.
 */
export class MdnsRelevanceFilter {
    // Per-owner footprint hashes (a multiset, so a name folding to an already-present label is reference-counted) or
    // the "all" sentinel. #footprints is the live union across owners (hash -> reference count).
    readonly #owners = new Map<string, Map<number, number> | "all">();
    readonly #footprints = new Map<number, number>();
    #allOwnerCount = 0;

    /**
     * Declare (replacing any prior declaration) the full set of DNS names an owner cares about.
     *
     * **`"all"` disables the pre-filter for the ENTIRE socket, not just this owner.** Because the socket cannot know
     * which packets an unenumerated owner wants, a single `"all"` forces every inbound packet to be fully decoded
     * again — i.e. it reverts the whole optimization to "decode everything" for every consumer sharing this socket.
     * Use it only when an owner genuinely cannot enumerate its service types, and prefer listing concrete names.
     * (When no owner has registered, or every registered name folds away, the gate is likewise inactive.) Any
     * component consuming the socket's receipt must register here (or `"all"`) or another owner's footprints could
     * filter its packets away.
     *
     * For owners whose interest changes one name at a time (e.g. discovered hostnames), prefer {@link addRelevantName}
     * / {@link removeRelevantName} which update in O(1) instead of rehashing the whole set.
     */
    registerRelevantNames(owner: string, names: Iterable<string> | "all") {
        this.#removeOwner(owner);
        if (names === "all") {
            this.#owners.set(owner, "all");
            this.#allOwnerCount++;
            return;
        }
        const counts = new Map<number, number>();
        for (const name of names) {
            const hash = footprintHash(name);
            if (hash === undefined) {
                continue;
            }
            counts.set(hash, (counts.get(hash) ?? 0) + 1);
        }
        this.#owners.set(owner, counts);
        for (const [hash, count] of counts) {
            this.#footprints.set(hash, (this.#footprints.get(hash) ?? 0) + count);
        }
    }

    /** Add a single name to an owner's footprints in O(1). No-op if the owner is registered as `"all"`. */
    addRelevantName(owner: string, name: string) {
        const hash = footprintHash(name);
        if (hash === undefined) {
            return;
        }
        let counts = this.#owners.get(owner);
        if (counts === "all") {
            return;
        }
        if (counts === undefined) {
            counts = new Map<number, number>();
            this.#owners.set(owner, counts);
        }
        counts.set(hash, (counts.get(hash) ?? 0) + 1);
        this.#footprints.set(hash, (this.#footprints.get(hash) ?? 0) + 1);
    }

    /** Remove a single previously-added name from an owner's footprints in O(1). */
    removeRelevantName(owner: string, name: string) {
        const hash = footprintHash(name);
        if (hash === undefined) {
            return;
        }
        const counts = this.#owners.get(owner);
        if (counts === undefined || counts === "all") {
            return;
        }
        const ownerCount = counts.get(hash);
        if (ownerCount === undefined) {
            return;
        }
        if (ownerCount <= 1) {
            counts.delete(hash);
        } else {
            counts.set(hash, ownerCount - 1);
        }
        this.#decrement(hash);
    }

    unregisterRelevantNames(owner: string) {
        this.#removeOwner(owner);
    }

    /**
     * Scan a raw packet for a registered footprint, deciding whether it is worth a full decode. Walks the DNS name
     * structure only — header counts then each question/RR name — skipping RDATA via `rdlength`, and follows
     * compression pointers so every label is visited regardless of how the packet encoded the name. Returns true
     * (keep) on any structural uncertainty so the decoder makes the authoritative call.
     */
    isRelevant(message: Bytes): boolean {
        // Inactive (accept all) when an owner cannot enumerate its interest, or nobody has registered a footprint
        if (this.#allOwnerCount > 0 || this.#footprints.size === 0) {
            return true;
        }
        const footprints = this.#footprints;
        const bytes = Bytes.of(message);
        const length = bytes.length;
        if (length < DNS_HEADER_SIZE) {
            return true;
        }
        const questionCount = (bytes[4] << 8) | bytes[5];
        const recordCount =
            questionCount +
            ((bytes[6] << 8) | bytes[7]) +
            ((bytes[8] << 8) | bytes[9]) +
            ((bytes[10] << 8) | bytes[11]);
        let offset = DNS_HEADER_SIZE;
        for (let record = 0; record < recordCount; record++) {
            // Scan the record name for a footprint, following compression pointers so every label is visited
            // regardless of how the packet encoded the name. `sequenceEnd` tracks where the name ends in the record
            // stream (the first pointer or the terminating zero), independent of where pointer-following reads.
            let cursor = offset;
            let sequenceEnd = -1;
            let hops = 0;
            for (;;) {
                if (cursor >= length) {
                    return true;
                }
                const labelLength = bytes[cursor];
                if (labelLength === 0) {
                    if (sequenceEnd < 0) {
                        sequenceEnd = cursor + 1;
                    }
                    break;
                }
                if ((labelLength & 0xc0) === 0xc0) {
                    if (cursor + 1 >= length) {
                        return true;
                    }
                    const pointer = ((labelLength & 0x3f) << 8) | bytes[cursor + 1];
                    if (sequenceEnd < 0) {
                        sequenceEnd = cursor + 2;
                    }
                    // RFC 1035 §4.1.4: pointers reference a prior position; anything else is malformed or a loop
                    if (pointer >= cursor || ++hops > MAX_NAME_POINTERS) {
                        return true;
                    }
                    cursor = pointer;
                    continue;
                }
                cursor++;
                if (cursor + labelLength > length) {
                    return true;
                }
                if (footprints.has(hashLabelBytes(bytes, cursor, labelLength))) {
                    return true;
                }
                cursor += labelLength;
            }
            offset = sequenceEnd;
            if (record < questionCount) {
                offset += 4; // QTYPE + QCLASS
            } else {
                if (offset + 10 > length) {
                    return true;
                }
                const rdlength = (bytes[offset + 8] << 8) | bytes[offset + 9];
                offset += 10 + rdlength; // TYPE + CLASS + TTL + RDLENGTH + RDATA
            }
        }
        return false;
    }

    #removeOwner(owner: string) {
        const entry = this.#owners.get(owner);
        if (entry === undefined) {
            return;
        }
        this.#owners.delete(owner);
        if (entry === "all") {
            this.#allOwnerCount--;
            return;
        }
        for (const [hash, count] of entry) {
            const current = this.#footprints.get(hash);
            if (current === undefined) {
                continue;
            }
            if (current <= count) {
                this.#footprints.delete(hash);
            } else {
                this.#footprints.set(hash, current - count);
            }
        }
    }

    #decrement(hash: number) {
        const current = this.#footprints.get(hash);
        if (current === undefined) {
            return;
        }
        if (current <= 1) {
            this.#footprints.delete(hash);
        } else {
            this.#footprints.set(hash, current - 1);
        }
    }
}
