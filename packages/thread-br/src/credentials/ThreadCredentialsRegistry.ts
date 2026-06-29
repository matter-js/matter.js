/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Observable } from "@matter/main";
import type { OperationalDataset } from "../dataset/OperationalDataset.js";
import type { ThreadNetworkCredentials } from "./ThreadNetworkCredentials.js";

/**
 * In-memory registry of {@link ThreadNetworkCredentials} keyed by extended PAN ID.
 *
 * Source of truth for "what credentials do we have to talk to which Thread network".
 * Diagnostic flows look up entries by extPanId; the network key is dropped on
 * registration so the registry never holds it.
 */
export class ThreadCredentialsRegistry {
    readonly #byExtPanId = new Map<string, ThreadNetworkCredentials>();
    readonly events = {
        registered: new Observable<[creds: ThreadNetworkCredentials]>(),
        unregistered: new Observable<[extPanId: Uint8Array]>(),
    };

    /**
     * Register credentials extracted from a parsed Operational Dataset.
     *
     * `networkKey` is intentionally dropped on the way in — the registry stores
     * only what's needed for diagnostic queries (extPanId, networkName, pskc,
     * activeTimestamp). Smaller blast radius for the most sensitive secret.
     *
     * Replaces any existing entry for the same extPanId; throws if the dataset
     * lacks extPanId, networkName, or pskc.
     */
    register(dataset: OperationalDataset): void {
        if (dataset.extPanId === undefined) {
            throw new Error("Cannot register credentials: dataset is missing extPanId");
        }
        if (dataset.networkName === undefined) {
            throw new Error("Cannot register credentials: dataset is missing networkName");
        }
        if (dataset.pskc === undefined) {
            throw new Error("Cannot register credentials: dataset is missing pskc");
        }
        this.registerCredentials({
            extPanId: dataset.extPanId,
            networkName: dataset.networkName,
            pskc: dataset.pskc,
            meshLocalPrefix: dataset.meshLocalPrefix,
            activeTimestamp: dataset.activeTimestamp === undefined ? undefined : bytesToBigint(dataset.activeTimestamp),
        });
    }

    /**
     * Register credentials directly. Intended for tests and external sources
     * that don't carry a full dataset. Same replacement semantics as {@link register}.
     *
     * Replacement always fires `registered` once with the new entry; the old entry
     * is silently overwritten because consumers care about "what is current", not
     * about churn. Intentional even when the new dataset's `activeTimestamp` is
     * older — losing an update is worse than a noisy log line.
     */
    registerCredentials(creds: ThreadNetworkCredentials): void {
        const stored: ThreadNetworkCredentials = {
            extPanId: creds.extPanId.slice(),
            networkName: creds.networkName,
            pskc: creds.pskc.slice(),
            meshLocalPrefix: creds.meshLocalPrefix?.slice(),
            activeTimestamp: creds.activeTimestamp,
        };
        this.#byExtPanId.set(keyOf(stored.extPanId), stored);
        // Emit a fresh copy so a listener mutating the typed-array views can't reach back into the stored entry.
        this.events.registered.emit(snapshot(stored));
    }

    /** Remove an entry. No-op if absent. */
    unregister(extPanId: Uint8Array): void {
        const key = keyOf(extPanId);
        if (!this.#byExtPanId.has(key)) return;
        this.#byExtPanId.delete(key);
        this.events.unregistered.emit(extPanId.slice());
    }

    /** Lookup by extPanId. Comparison is by Uint8Array equality, not reference. */
    getCredentials(extPanId: Uint8Array): ThreadNetworkCredentials | undefined {
        return this.#byExtPanId.get(keyOf(extPanId));
    }

    /** Defensive snapshot — caller cannot mutate the registry through it. */
    list(): ReadonlyArray<ThreadNetworkCredentials> {
        return Array.from(this.#byExtPanId.values());
    }
}

function keyOf(extPanId: Uint8Array): string {
    return Bytes.toHex(extPanId);
}

function snapshot(creds: ThreadNetworkCredentials): ThreadNetworkCredentials {
    return {
        extPanId: creds.extPanId.slice(),
        networkName: creds.networkName,
        pskc: creds.pskc.slice(),
        meshLocalPrefix: creds.meshLocalPrefix?.slice(),
        activeTimestamp: creds.activeTimestamp,
    };
}

// matter.js exposes `Bytes.fromBigInt` but no inverse `Bytes.toBigInt` yet —
// dataset's activeTimestamp is a fixed-width 8-byte BE field so the loop is safe.
function bytesToBigint(bytes: Uint8Array): bigint {
    let result = 0n;
    for (const b of bytes) {
        result = (result << 8n) | BigInt(b);
    }
    return result;
}
