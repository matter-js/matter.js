/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    type DnsRecord,
    DnsRecordType,
    Environment,
    Hours,
    Logger,
    Observable,
    type SrvRecordValue,
} from "@matter/general";
import { MdnsService } from "@matter/protocol";
import type { BorderRouterEntry } from "./BorderRouterEntry.js";
import type { DiscoveredObserver, DnssdNameLike, DnssdNamesLike, NameObserver } from "./DnssdLikeTypes.js";

const logger = Logger.get("BorderRouterRegistry");

const REGISTRY_MAX_ENTRIES = 256;
/** Generous headroom above REGISTRY_MAX_ENTRIES so we still observe instances that haven't
 *  yet emitted a valid xa, but bounded so a noisy LAN can't grow `#instanceObservers`
 *  without limit. Eviction targets the oldest xa-less observer first. */
const INSTANCE_OBSERVER_CAP = 512;
/** Stale entries (sources.length === 0) become eligible for pruning 24h after their
 *  last successful mDNS discovery (entry.lastSeen). Pruning is lazy — `#pruneExpired`
 *  runs on `list` / `get` / `#onDiscovered`, so without activity an eligible entry
 *  may linger past the window. Long enough that BRs announcing once per ~half-day
 *  stay resolvable; short enough that vanished BRs eventually drop. */
const STALE_RETENTION = Hours(24);
const MESHCOP_TYPE_QNAME = "_meshcop._udp.local";
const TREL_TYPE_QNAME = "_trel._udp.local";
const MESHCOP_SUFFIX = "._meshcop._udp.local";
const TREL_SUFFIX = "._trel._udp.local";

type Source = "meshcop" | "trel";

interface InstanceTracking {
    name: DnssdNameLike;
    source: Source;
    observer: NameObserver;
    targetKey?: string;
    xaKey?: string;
    /** Set when the observer is attached. Used to evict oldest xa-less observers when
     *  `#instanceObservers` grows past {@link INSTANCE_OBSERVER_CAP}. */
    firstSeen: number;
}

interface TargetTracking {
    target: DnssdNameLike;
    observer: NameObserver;
    refcount: number;
}

/**
 * Passive Thread Border Router discovery via mDNS.
 *
 * Subscribes to `_meshcop._udp.local` and `_trel._udp.local`, builds a per-extended-address
 * registry, and exposes the current entries through {@link list}. Embedders own the lifecycle
 * via {@link start} / {@link stop}.
 */
export class BorderRouterRegistry {
    /**
     * Lifecycle events for registry entries. Each fires with an immutable snapshot of
     * the entry. `updated` fires for any field change (TXT, addresses, ports); callers
     * that only care about specific transitions must diff themselves. `removed` fires
     * when a BR is pruned (24h stale or evicted under load); callers can use it to
     * tear down per-BR side state (e.g. cached REST capabilities).
     */
    readonly events = {
        added: new Observable<[BorderRouterEntry]>(),
        updated: new Observable<[BorderRouterEntry]>(),
        removed: new Observable<[BorderRouterEntry]>(),
    };

    readonly #env: Environment;
    readonly #registry = new Map<string, BorderRouterEntry>();
    readonly #instanceObservers = new Map<string, InstanceTracking>();
    readonly #targetObservers = new Map<string, TargetTracking>();
    #names?: DnssdNamesLike;
    #injectedNames?: DnssdNamesLike;
    #suffixFilter?: (record: DnsRecord) => boolean;
    #discoveredObserver?: DiscoveredObserver;
    #started = false;
    /** Incremented on every start/stop. Lets a pending `await mdns.construction.ready`
     *  detect that `stop()` ran while it was suspended and abort partial setup. */
    #startGeneration = 0;
    #evictionWarnedThisCycle = false;

    constructor(env: Environment, names?: DnssdNamesLike) {
        this.#env = env;
        this.#injectedNames = names;
    }

    async start(): Promise<void> {
        if (this.#started) return;
        const gen = ++this.#startGeneration;
        this.#evictionWarnedThisCycle = false;

        let names: DnssdNamesLike;
        if (this.#injectedNames !== undefined) {
            names = this.#injectedNames;
        } else {
            try {
                const mdns = this.#env.get(MdnsService);
                await mdns.construction.ready;
                if (gen !== this.#startGeneration) return;
                names = mdns.names;
            } catch (e) {
                if (gen !== this.#startGeneration) return;
                logger.error("MDNS service unavailable; border router discovery inactive:", e);
                return;
            }
        }
        this.#started = true;
        this.#names = names;

        const suffixFilter = ({ name }: DnsRecord): boolean => {
            const lower = name.toLowerCase();
            return lower.endsWith(MESHCOP_SUFFIX) || lower.endsWith(TREL_SUFFIX);
        };
        this.#suffixFilter = suffixFilter;
        names.filters.add(suffixFilter, [MESHCOP_TYPE_QNAME, TREL_TYPE_QNAME]);

        const meshcopType = names.get(MESHCOP_TYPE_QNAME);
        const trelType = names.get(TREL_TYPE_QNAME);
        names.solicitor.solicit({ name: meshcopType, recordTypes: [DnsRecordType.PTR] });
        names.solicitor.solicit({ name: trelType, recordTypes: [DnsRecordType.PTR] });

        const observer: DiscoveredObserver = name => this.#onDiscovered(name);
        this.#discoveredObserver = observer;
        names.discovered.on(observer);
    }

    async stop(): Promise<void> {
        // Bump the generation so any in-flight start() exits without attaching observers.
        this.#startGeneration++;
        if (!this.#started) return;
        this.#started = false;

        const names = this.#names;
        if (names !== undefined) {
            if (this.#discoveredObserver !== undefined) {
                names.discovered.off(this.#discoveredObserver);
            }
            if (this.#suffixFilter !== undefined) {
                names.filters.delete(this.#suffixFilter);
            }
        }
        this.#discoveredObserver = undefined;
        this.#suffixFilter = undefined;

        for (const tracking of this.#instanceObservers.values()) {
            tracking.name.off(tracking.observer);
        }
        this.#instanceObservers.clear();

        for (const tracking of this.#targetObservers.values()) {
            tracking.target.off(tracking.observer);
        }
        this.#targetObservers.clear();

        this.#registry.clear();
        this.#names = undefined;
    }

    list(): BorderRouterEntry[] {
        this.#pruneExpired();
        return Array.from(this.#registry.values(), entry => this.#snapshotEntry(entry));
    }

    get(extAddressHex: string): BorderRouterEntry | undefined {
        this.#pruneExpired();
        const entry = this.#registry.get(extAddressHex.toUpperCase());
        return entry === undefined ? undefined : this.#snapshotEntry(entry);
    }

    #pruneExpired(): void {
        const cutoff = Date.now() - STALE_RETENTION;
        const pruned = new Array<BorderRouterEntry>();
        for (const [xaKey, entry] of this.#registry) {
            if (entry.sources.length === 0 && entry.lastSeen < cutoff) {
                this.#registry.delete(xaKey);
                pruned.push(this.#snapshotEntry(entry));
            }
        }
        for (const entry of pruned) {
            this.events.removed.emit(entry);
        }
    }

    /** Shallow copy so callers cannot mutate registry state through the returned reference. */
    #snapshotEntry(entry: BorderRouterEntry): BorderRouterEntry {
        return {
            ...entry,
            sources: [...entry.sources],
            addresses: [...entry.addresses],
        };
    }

    #onDiscovered(name: DnssdNameLike): void {
        if (!this.#started) return;
        this.#pruneExpired();
        const lower = name.qname.toLowerCase();
        if (lower === MESHCOP_TYPE_QNAME || lower === TREL_TYPE_QNAME) {
            return;
        }
        let source: Source;
        if (lower.endsWith(MESHCOP_SUFFIX)) {
            source = "meshcop";
        } else if (lower.endsWith(TREL_SUFFIX)) {
            source = "trel";
        } else {
            return;
        }

        const key = lower;
        if (this.#instanceObservers.has(key)) {
            return;
        }

        if (this.#instanceObservers.size >= INSTANCE_OBSERVER_CAP) {
            // Drop xa-less observers first (cheapest to lose); if every observer already
            // has an xa, fall back to evicting the oldest registry entry, which detaches
            // its instance observers via the same path. Repeat until under the cap so
            // the cap is strictly enforced even on a flood of valid-xa instances.
            while (this.#instanceObservers.size >= INSTANCE_OBSERVER_CAP) {
                if (!this.#evictOldestPendingInstance() && !this.#evictOldest()) break;
            }
        }

        const observer: NameObserver = () => this.#onInstanceChanged(name, source);
        this.#instanceObservers.set(key, { name, source, observer, firstSeen: Date.now() });
        name.on(observer);

        this.#parseAndUpsert(name, source);
    }

    /**
     * Evict the oldest xa-less instance observer when the observer cap is hit. Instances
     * that never publish a valid `xa` (malformed broadcasters or hostile noise) would
     * otherwise pin observers in `#instanceObservers` indefinitely — eviction targets only
     * those because observers tied to real registry entries are managed by `#evictOldest`.
     */
    #evictOldestPendingInstance(): boolean {
        let oldestKey: string | undefined;
        let oldestSeen = Number.POSITIVE_INFINITY;
        for (const [k, t] of this.#instanceObservers) {
            if (t.xaKey !== undefined) continue;
            if (t.firstSeen < oldestSeen) {
                oldestSeen = t.firstSeen;
                oldestKey = k;
            }
        }
        if (oldestKey === undefined) return false;
        const tracking = this.#instanceObservers.get(oldestKey);
        if (tracking === undefined) return false;
        tracking.name.off(tracking.observer);
        if (tracking.targetKey !== undefined) {
            this.#releaseTarget(tracking.targetKey);
        }
        this.#instanceObservers.delete(oldestKey);
        return true;
    }

    #onInstanceChanged(name: DnssdNameLike, source: Source): void {
        if (!this.#started) return;
        if (name.isDiscovered) {
            try {
                this.#parseAndUpsert(name, source);
            } catch (e) {
                logger.warn("Error processing border router instance change:", e);
            }
            return;
        }

        const key = name.qname.toLowerCase();
        const tracking = this.#instanceObservers.get(key);
        if (tracking === undefined) {
            return;
        }
        tracking.name.off(tracking.observer);
        this.#instanceObservers.delete(key);

        if (tracking.targetKey !== undefined) {
            this.#releaseTarget(tracking.targetKey);
        }

        const xaKey = tracking.xaKey;
        if (xaKey === undefined) {
            return;
        }
        const entry = this.#registry.get(xaKey);
        if (entry === undefined) {
            return;
        }
        const idx = entry.sources.indexOf(source);
        if (idx !== -1) {
            entry.sources.splice(idx, 1);
        }
    }

    #onTargetChanged(target: DnssdNameLike): void {
        if (!this.#started) return;
        try {
            const targetQname = target.qname.toLowerCase();
            const updated = new Array<BorderRouterEntry>();
            for (const entry of this.#registry.values()) {
                if (entry.hostname?.toLowerCase() !== targetQname) continue;
                // A transient mDNS A/AAAA cache flush/expiry yields no addresses; keep the
                // last-known reachable set rather than zeroing it (mirrors #parseAndUpsert's
                // empty-address guard). Address-less "host gone" is signalled via `removed`.
                const addresses = this.#sortAddresses(this.#collectAddresses(target));
                if (addresses.length === 0) continue;
                entry.addresses = addresses;
                updated.push(this.#snapshotEntry(entry));
            }
            for (const entry of updated) {
                this.events.updated.emit(entry);
            }
        } catch (e) {
            logger.warn("Error processing border router target change:", e);
        }
    }

    #parseAndUpsert(name: DnssdNameLike, source: Source): void {
        const names = this.#names;
        if (names === undefined) return;

        try {
            const params = name.parameters;
            let xaKey = rawHex(params.raw("xa"), 8);
            if (xaKey === undefined && source === "trel") {
                // Thread §11.4.2: TREL DNS-SD instance name MUST be the 16-char upper-case
                // hex EUI-64. Fall back to the instance name when the TXT xa is missing or
                // malformed; vendor stays unknown until/unless a `_meshcop` record arrives.
                xaKey = deriveXaFromTrelInstance(name.qname);
                if (xaKey !== undefined) {
                    logger.info(`TREL instance xa derived from instance name qname="${name.qname}" xa=${xaKey}`);
                }
            }
            if (xaKey === undefined) {
                const rawXa = params.raw("xa");
                const xaInfo =
                    rawXa === undefined ? "missing" : `${rawXa.byteLength}B:${Bytes.toHex(rawXa).toUpperCase()}`;
                const nn = params.get("nn");
                const vn = params.get("vn");
                logger.debug(
                    `BR instance skipped (no xa yet) qname="${name.qname}" source=${source} xa=${xaInfo} nn="${nn ?? ""}" vn="${vn ?? ""}"`,
                );
                return;
            }

            const records = Array.from(name.records);
            const srvRecord = records.find(r => r.recordType === DnsRecordType.SRV);
            let srvTarget: string | undefined;
            let srvPort: number | undefined;
            if (srvRecord !== undefined && isSrvValue(srvRecord.value)) {
                srvTarget = srvRecord.value.target;
                srvPort = srvRecord.value.port;
            }

            let addresses: string[] = [];
            const tracking = this.#instanceObservers.get(name.qname.toLowerCase());
            if (srvTarget !== undefined) {
                const target = names.get(srvTarget);
                addresses = this.#sortAddresses(this.#collectAddresses(target));
                this.#attachTargetObserver(name, srvTarget, target);
            } else if (tracking?.targetKey !== undefined) {
                // Update dropped the SRV record. Release the previously-attached target
                // observer so its refcount is decremented and the entry doesn't keep
                // receiving address updates for a hostname this instance no longer points at.
                this.#releaseTarget(tracking.targetKey);
                tracking.targetKey = undefined;
            }

            const xp = rawHex(params.raw("xp"), 8);

            const existing = this.#registry.get(xaKey);
            const meshcopWins = source === "meshcop";
            const entry: BorderRouterEntry = existing ?? {
                extAddressHex: xaKey,
                addresses: [],
                sources: [],
                lastSeen: Date.now(),
            };

            const meshcopAlreadyContributed = entry.sources.includes("meshcop");
            const canOverwrite = meshcopWins || !meshcopAlreadyContributed;

            if (xp !== undefined && canOverwrite) {
                entry.extendedPanIdHex = xp;
            }

            const previousHostname = entry.hostname;
            if (srvTarget !== undefined && canOverwrite) {
                entry.hostname = srvTarget;
            }

            if (
                source === "meshcop" &&
                srvTarget !== undefined &&
                previousHostname !== undefined &&
                previousHostname.toLowerCase() !== srvTarget.toLowerCase()
            ) {
                this.#repointTrelTargetForXa(xaKey, previousHostname, srvTarget, names);
            }

            if (addresses.length > 0 && canOverwrite) {
                entry.addresses = addresses;
            }

            if (source === "meshcop") {
                if (srvPort !== undefined) entry.meshcopPort = srvPort;
                const nn = params.get("nn");
                if (nn !== undefined) entry.networkName = nn;
                const vn = params.get("vn");
                if (vn !== undefined) entry.vendorName = vn;
                const mn = params.get("mn");
                if (mn !== undefined) entry.modelName = mn;
                const tv = params.get("tv");
                if (tv !== undefined) entry.threadVersion = tv;
                const sv = params.get("sv");
                if (sv !== undefined) entry.swVersion = sv;
                const rv = params.get("rv");
                if (rv !== undefined) entry.recordVersion = rv;
                // dd (border-agent ID) is variable-width per spec; xa/xp/at = 8 bytes,
                // pt/sb = 4 bytes (Thread MeshCoP). Reject malformed lengths for fixed
                // fields so a malformed broadcaster can't pollute the snapshot.
                // OpenThread upstream uses `ai`; some BRs (Apple variants) use `dd`.
                // Prefer `ai` when both present.
                const aiHex = rawHex(params.raw("ai"));
                const ddHex = rawHex(params.raw("dd"));
                const borderAgentIdHex = aiHex ?? ddHex;
                if (borderAgentIdHex !== undefined) entry.borderAgentIdHex = borderAgentIdHex;
                const sb = rawHex(params.raw("sb"), 4);
                if (sb !== undefined) entry.stateBitmapHex = sb;
                const at = rawHex(params.raw("at"), 8);
                if (at !== undefined) entry.activeTimestampHex = at;
                const pt = rawHex(params.raw("pt"), 4);
                if (pt !== undefined) entry.partitionIdHex = pt;
                const dn = params.get("dn");
                if (dn !== undefined) entry.domainName = dn;
            } else if (source === "trel") {
                if (srvPort !== undefined) entry.trelPort = srvPort;
            }

            if (!entry.sources.includes(source)) {
                if (source === "meshcop") {
                    entry.sources.unshift(source);
                } else {
                    entry.sources.push(source);
                }
            }
            entry.lastSeen = Date.now();

            if (existing === undefined) {
                if (this.#registry.size >= REGISTRY_MAX_ENTRIES) {
                    this.#evictOldest();
                }
                this.#registry.set(xaKey, entry);
                this.events.added.emit(this.#snapshotEntry(entry));
            } else {
                this.events.updated.emit(this.#snapshotEntry(entry));
            }

            if (tracking !== undefined) {
                tracking.xaKey = xaKey;
            }
        } catch (e) {
            logger.warn("Error parsing border router record:", e);
        }
    }

    #collectAddresses(target: DnssdNameLike): string[] {
        const out = new Array<string>();
        for (const record of target.records) {
            if (record.recordType !== DnsRecordType.A && record.recordType !== DnsRecordType.AAAA) continue;
            if (typeof record.value === "string") {
                out.push(record.value);
            }
        }
        return out;
    }

    #sortAddresses(addresses: string[]): string[] {
        const seen = new Set<string>();
        const unique = new Array<string>();
        for (const addr of addresses) {
            if (!seen.has(addr)) {
                seen.add(addr);
                unique.push(addr);
            }
        }
        const ipv4 = unique.filter(a => !a.includes(":"));
        const ipv6 = unique.filter(a => a.includes(":"));
        const categorize = (a: string): number => {
            const lower = a.toLowerCase();
            if (lower.startsWith("fe80:")) return 2;
            if (lower.startsWith("fc") || lower.startsWith("fd")) return 1;
            const firstChar = lower.charAt(0);
            if (firstChar === "2" || firstChar === "3") return 0;
            return 3;
        };
        ipv6.sort((a, b) => {
            const ca = categorize(a);
            const cb = categorize(b);
            if (ca !== cb) return ca - cb;
            return a.localeCompare(b);
        });
        ipv4.sort((a, b) => a.localeCompare(b));
        return [...ipv4, ...ipv6];
    }

    #attachTargetObserver(instance: DnssdNameLike, srvTarget: string, target: DnssdNameLike): void {
        const targetKey = srvTarget.toLowerCase();
        const instanceKey = instance.qname.toLowerCase();
        const instanceTracking = this.#instanceObservers.get(instanceKey);
        const previousTargetKey = instanceTracking?.targetKey;

        if (previousTargetKey === targetKey) {
            return;
        }

        if (previousTargetKey !== undefined) {
            this.#releaseTarget(previousTargetKey);
        }

        const existing = this.#targetObservers.get(targetKey);
        if (existing !== undefined) {
            existing.refcount++;
        } else {
            const observer: NameObserver = () => this.#onTargetChanged(target);
            target.on(observer);
            this.#targetObservers.set(targetKey, { target, observer, refcount: 1 });
        }
        if (instanceTracking !== undefined) {
            instanceTracking.targetKey = targetKey;
        }
    }

    #repointTrelTargetForXa(xaKey: string, previousHostname: string, newTarget: string, names: DnssdNamesLike): void {
        const previousKey = previousHostname.toLowerCase();
        for (const tracking of this.#instanceObservers.values()) {
            if (tracking.xaKey !== xaKey) continue;
            if (tracking.source !== "trel") continue;
            if (tracking.targetKey !== previousKey) continue;
            this.#attachTargetObserver(tracking.name, newTarget, names.get(newTarget));
        }
    }

    #releaseTarget(targetKey: string): void {
        const tracking = this.#targetObservers.get(targetKey);
        if (tracking === undefined) return;
        tracking.refcount--;
        if (tracking.refcount <= 0) {
            tracking.target.off(tracking.observer);
            this.#targetObservers.delete(targetKey);
        }
    }

    #evictOldest(): boolean {
        let oldestStaleKey: string | undefined;
        let oldestStaleSeen = Number.POSITIVE_INFINITY;
        let oldestLiveKey: string | undefined;
        let oldestLiveSeen = Number.POSITIVE_INFINITY;
        for (const [xa, entry] of this.#registry) {
            if (entry.sources.length === 0) {
                if (entry.lastSeen < oldestStaleSeen) {
                    oldestStaleSeen = entry.lastSeen;
                    oldestStaleKey = xa;
                }
            } else if (entry.lastSeen < oldestLiveSeen) {
                oldestLiveSeen = entry.lastSeen;
                oldestLiveKey = xa;
            }
        }
        const evictKey = oldestStaleKey ?? oldestLiveKey;
        if (evictKey === undefined) return false;

        const evicted = this.#registry.get(evictKey);
        this.#registry.delete(evictKey);
        if (evicted !== undefined) {
            this.events.removed.emit(this.#snapshotEntry(evicted));
        }

        let releasedObservers = 0;
        for (const [instanceKey, tracking] of [...this.#instanceObservers]) {
            if (tracking.xaKey !== evictKey) continue;
            tracking.name.off(tracking.observer);
            if (tracking.targetKey !== undefined) {
                this.#releaseTarget(tracking.targetKey);
            }
            this.#instanceObservers.delete(instanceKey);
            releasedObservers++;
        }

        if (!this.#evictionWarnedThisCycle) {
            this.#evictionWarnedThisCycle = true;
            logger.warn(
                `Border router registry exceeded ${REGISTRY_MAX_ENTRIES} entries; evicting oldest (released ${releasedObservers} instance observer${releasedObservers === 1 ? "" : "s"})`,
            );
        } else {
            logger.debug(`Evicted border router xa=${evictKey}; released ${releasedObservers} instance observers`);
        }
        return true;
    }
}

function isSrvValue(value: unknown): value is SrvRecordValue {
    return (
        typeof value === "object" &&
        value !== null &&
        "target" in value &&
        typeof value.target === "string" &&
        "port" in value &&
        typeof value.port === "number"
    );
}

/**
 * MeshCoP TXT records carry binary-valued fields (xa, xp, at, pt, dd, sb) — raw bytes per
 * Thread spec. Bytes.toHex returns lowercase; callers can require an exact byte length so
 * malformed broadcasters can't pollute the registry with non-canonical xa keys (the
 * dashboard's xa→xa join expects uppercase 16-char hex, i.e. 8 bytes).
 */
function rawHex(bytes: Bytes | undefined, expectedByteLength?: number): string | undefined {
    if (bytes === undefined || bytes.byteLength === 0) return undefined;
    if (expectedByteLength !== undefined && bytes.byteLength !== expectedByteLength) return undefined;
    return Bytes.toHex(bytes).toUpperCase();
}

/**
 * Extract the 16-char uppercase hex EUI-64 from a TREL service instance qname.
 * Returns undefined if the instance label is not 16 hex characters. Per Thread
 * spec §11.4.2 the instance name MUST be the EUI-64 in hex, so this is a safe
 * fallback when the xa TXT key is missing.
 */
function deriveXaFromTrelInstance(qname: string): string | undefined {
    const dot = qname.indexOf(".");
    const label = dot === -1 ? qname : qname.slice(0, dot);
    if (!/^[0-9a-fA-F]{16}$/.test(label)) return undefined;
    return label.toUpperCase();
}
