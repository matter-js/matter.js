/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, type Duration, errorOf, Logger, Observable, Seconds } from "@matter/general";
import type { DiagnosticResponse } from "../diagnostic/DiagnosticResponse.js";
import type { DiagnosticSource, QueryMulticastHandle, QueryMulticastOptions } from "../diagnostic/DiagnosticSource.js";
import { DEFAULT_RESET_TLV_TYPES } from "../diagnostic/DiagnosticSource.js";
import { runActionToCompletion } from "./OtbrRestActionRunner.js";
import type { OtbrRestCapability } from "./OtbrRestCapability.js";
import type { OtbrRestClient } from "./OtbrRestClient.js";
import { OtbrRestError } from "./OtbrRestError.js";
import { translateNodeJson } from "./translation.js";

const logger = Logger.get("OtbrRestDiagnosticSource");

type ClientLike = Pick<
    OtbrRestClient,
    | "getDiagnostics"
    | "resetDiagnosticCounters"
    | "postAction"
    | "getAction"
    | "getDiagnosticsCollection"
    | "listDevices"
    | "clearDiagnostics"
>;

/**
 * Network-diagnostic TLV types requested per node on the collection API. This is the authoritative
 * queryable set from ot-br-posix's own REST test suite (`getNetworkDiagnosticTask` AllTLVs) — every
 * key here is a valid request type; a type the build rejects fails the whole action with 400.
 */
const DEFAULT_DIAG_TYPES: readonly string[] = [
    "extAddress",
    "rloc16",
    "leaderData",
    "ipv6Addresses",
    "macCounters",
    "childTable",
    "route",
    "eui64",
    "version",
    "vendorName",
    "vendorModel",
    "vendorSwVersion",
    "threadStackVersion",
    "children",
    "childIpv6Addresses",
    "routerNeighbors",
    "mleCounters",
];

/** BR-side mesh-query timeouts (seconds), passed as the action `timeout` attribute. */
const DISCOVER_TASK_TIMEOUT_S = 15;
const DIAG_TASK_TIMEOUT_S = 10;

/**
 * `updateDeviceCollectionTask` requires `maxAge`, `maxRetries`, `deviceCount` and `timeout` — the
 * BR rejects the action (422) if any is absent. `maxAge`/`maxRetries` use the values from
 * ot-br-posix's own REST examples; `deviceCount` is an upper-bound hint (see options).
 */
const DISCOVER_MAX_AGE_S = 30;
const DISCOVER_MAX_RETRIES = 5;
const DEFAULT_DEVICE_COUNT = 64;

const DEFAULT_POLL_INTERVAL = Seconds(0.5);
const DEFAULT_ACTION_TIMEOUT = Seconds(15);
const DEFAULT_DISCOVER_TIMEOUT = Seconds(20);
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_RETRIES = 2;

/** Tunables for the collection-API orchestration; all optional with sensible defaults. */
export interface OtbrRestDiagnosticOptions {
    /** Delay between action-status polls. */
    pollInterval?: Duration;
    /** How long to wait for a single per-node diagnostic action to settle. */
    actionTimeout?: Duration;
    /** How long to wait for the device-discovery action to settle. */
    discoverTimeout?: Duration;
    /** Maximum concurrent per-node diagnostic actions in flight. */
    maxConcurrent?: number;
    /** Extra attempts for a node whose diagnostic action stops/fails (transient; the BR retries too). */
    retries?: number;
    /** Diagnostic TLV types to request per node. Defaults to the full queryable set. */
    types?: readonly string[];
    /** Upper-bound hint for the number of devices to discover. */
    deviceCount?: number;
}

/**
 * {@link DiagnosticSource} over the OTBR REST surface.
 *
 * Two build families are supported, selected by {@link OtbrRestCapability.diagnosticsApi}:
 * - `"legacy"` — the pre-collection `GET /diagnostics` snapshot (older BRs).
 * - `"collection"` — the post-2024 action model: discover devices, issue a per-node
 *   `getNetworkDiagnosticTask`, poll each to completion, then read the aggregated
 *   `/api/diagnostics` collection.
 *
 * Nodes whose per-node action stops or fails are skipped (partial results are valid — the OTBR web
 * UI behaves the same). Bind one instance per discovered OTBR REST endpoint.
 */
export class OtbrRestDiagnosticSource implements DiagnosticSource {
    readonly kind = "otbr-rest" as const;

    readonly #client: ClientLike;
    readonly #capability: OtbrRestCapability;
    readonly #pollInterval: Duration;
    readonly #actionTimeout: Duration;
    readonly #discoverTimeout: Duration;
    readonly #maxConcurrent: number;
    readonly #types: readonly string[];
    readonly #deviceCount: number;
    readonly #retries: number;

    constructor(client: ClientLike, capability: OtbrRestCapability, options: OtbrRestDiagnosticOptions = {}) {
        this.#client = client;
        this.#capability = capability;
        this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
        this.#actionTimeout = options.actionTimeout ?? DEFAULT_ACTION_TIMEOUT;
        this.#discoverTimeout = options.discoverTimeout ?? DEFAULT_DISCOVER_TIMEOUT;
        this.#maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
        this.#types = options.types ?? DEFAULT_DIAG_TYPES;
        this.#deviceCount = options.deviceCount ?? DEFAULT_DEVICE_COUNT;
        this.#retries = options.retries ?? DEFAULT_RETRIES;
    }

    /**
     * Returns `true` when `extPanId` matches the network this source was probed for.
     */
    canQuery(extPanId: Bytes): boolean {
        return Bytes.areEqual(extPanId, this.#capability.extPanId);
    }

    /**
     * Query diagnostics for a single mesh node by RLOC16.
     *
     * Both build families fetch the full mesh view and filter by `rloc16` (the collection API has no
     * cheap per-RLOC16 query — the device directory carries no rloc16 — so it runs the same populate
     * flow as {@link queryMulticast}).
     *
     * @throws {@link OtbrRestError} `"rest_protocol"` for an ip-only target, a missing `rloc16`, or
     *   when no entry matches `rloc16`.
     */
    async queryUnicast(target: { rloc16?: number; ip?: string }, _tlvTypes: number[]): Promise<DiagnosticResponse> {
        if (target.ip !== undefined && target.rloc16 === undefined) {
            throw new OtbrRestError(
                "rest_protocol",
                "OtbrRestDiagnosticSource: ip-routed unicast is not supported in REST mode — supply rloc16",
            );
        }
        if (target.rloc16 === undefined) {
            throw new OtbrRestError("rest_protocol", "OtbrRestDiagnosticSource: rloc16 required for unicast query");
        }
        const nodes = await this.#collect();
        const match = nodes.find(node => node.rloc16 === target.rloc16);
        if (match === undefined) {
            throw new OtbrRestError("rest_protocol", `rloc16 0x${target.rloc16.toString(16)} not found in diagnostics`);
        }
        return match;
    }

    /**
     * Stream all mesh-node diagnostics. The REST surface has no per-scope filtering, so `scope`,
     * `tlvTypes` and `windowMs` are ignored; all nodes are emitted in one burst and `done` resolves
     * once the collection is complete.
     */
    queryMulticast(_scope: "ff03::1" | "ff03::2", _opts: QueryMulticastOptions): QueryMulticastHandle {
        const onNode = new Observable<[DiagnosticResponse]>();
        const onError = new Observable<[Error]>();
        let resolveDone!: () => void;
        let rejectDone!: (err: Error) => void;
        const done = new Promise<void>((resolve, reject) => {
            resolveDone = resolve;
            rejectDone = reject;
        });

        void (async () => {
            try {
                const nodes = await this.#collect();
                for (const node of nodes) onNode.emit(node);
                resolveDone();
            } catch (err) {
                const e = errorOf(err);
                onError.emit(e);
                rejectDone(e);
            }
        })();

        return {
            onNode,
            onError,
            done,
            close: async () => {
                await done.catch(() => {});
            },
        };
    }

    /** Fetch and decode the full mesh view via the build-appropriate REST flavor. */
    async #collect(): Promise<DiagnosticResponse[]> {
        if (this.#capability.diagnosticsApi === "none") {
            throw new OtbrRestError(
                "rest_unsupported",
                "OtbrRestDiagnosticSource: this Border Router does not serve diagnostics over REST",
            );
        }
        const entries =
            this.#capability.diagnosticsApi === "collection"
                ? await this.#collectViaActions()
                : await this.#client.getDiagnostics();
        const decoded = new Array<DiagnosticResponse>();
        for (const entry of entries) {
            try {
                decoded.push(translateNodeJson(entry));
            } catch (err) {
                // One undecodable node must not drop the whole mesh view.
                logger.debug(`skipping undecodable diagnostic entry: ${errorOf(err).message}`);
            }
        }
        return dedupeByRloc16(decoded);
    }

    /**
     * Collection-API flow: clear stale results, discover the device directory, issue a per-node
     * diagnostic action (bounded concurrency), then read the aggregated collection.
     */
    async #collectViaActions(): Promise<unknown[]> {
        await this.#client.clearDiagnostics();

        const discoverId = await this.#client.postAction("updateDeviceCollectionTask", {
            maxAge: DISCOVER_MAX_AGE_S,
            maxRetries: DISCOVER_MAX_RETRIES,
            deviceCount: this.#deviceCount,
            timeout: DISCOVER_TASK_TIMEOUT_S,
        });
        const discover = await runActionToCompletion(this.#client, discoverId, {
            pollInterval: this.#pollInterval,
            timeout: this.#discoverTimeout,
        });
        if (discover.status !== "completed") {
            logger.debug(`OTBR device discovery ended ${discover.status}; device directory may be incomplete`);
        }

        const devices = await this.#client.listDevices();
        const extAddresses = devices
            .map(device => (isRecord(device) ? device["extAddress"] : undefined))
            .filter((value): value is string => typeof value === "string");

        await runBounded(extAddresses, this.#maxConcurrent, async extAddress => {
            // A node whose action stops is usually transient (mesh busy) — the OTBR web UI retries
            // too. Retry up to #retries times; a node that still won't answer is skipped so one
            // unreachable node never aborts the sweep.
            for (let attempt = 0; attempt <= this.#retries; attempt++) {
                try {
                    const id = await this.#client.postAction("getNetworkDiagnosticTask", {
                        destination: extAddress,
                        types: [...this.#types],
                        timeout: DIAG_TASK_TIMEOUT_S,
                    });
                    const { status } = await runActionToCompletion(this.#client, id, {
                        pollInterval: this.#pollInterval,
                        timeout: this.#actionTimeout,
                    });
                    if (status === "completed") return;
                    logger.debug(
                        `diagnostic action for ${extAddress} ended ${status} (attempt ${attempt + 1}/${this.#retries + 1})`,
                    );
                } catch (err) {
                    logger.debug(
                        `diagnostic action for ${extAddress} failed (attempt ${attempt + 1}/${this.#retries + 1}): ${errorOf(err).message}`,
                    );
                }
            }
        });

        const results = await this.#client.getDiagnosticsCollection();
        if (extAddresses.length > 0 && results.length === 0) {
            // Distinguish a systemic failure from an empty mesh (a bare "0 nodes" otherwise hides it).
            logger.warn(
                `OTBR diagnostics: discovered ${extAddresses.length} device(s) but every per-node query failed`,
            );
        }
        return results;
    }

    /**
     * Zero MAC and MLE counters on a single mesh node via the OTBR REST API. Only available on
     * camelCase OTBR backends; throws {@link OtbrRestError} `"rest_disabled"` otherwise.
     */
    async resetCounters(
        _target: { rloc16?: number; ip?: string },
        _tlvTypes: ReadonlyArray<number> = DEFAULT_RESET_TLV_TYPES,
    ): Promise<void> {
        if (this.#capability.keyFormat !== "camel") {
            throw new OtbrRestError(
                "rest_disabled",
                "OtbrRestDiagnosticSource: resetCounters requires the camelCase (/api/actions) OTBR backend",
            );
        }
        await this.#client.resetDiagnosticCounters({ action: "resetNetworkDiagCounterTask" });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Drop duplicate nodes (two BRs report overlapping views); keep the first per rloc16. */
function dedupeByRloc16(nodes: DiagnosticResponse[]): DiagnosticResponse[] {
    const seen = new Set<number>();
    const out = new Array<DiagnosticResponse>();
    for (const node of nodes) {
        if (node.rloc16 !== undefined) {
            if (seen.has(node.rloc16)) continue;
            seen.add(node.rloc16);
        }
        out.push(node);
    }
    return out;
}

/**
 * Run `fn` over `items` with at most `limit` concurrent executions. `fn` must handle its own errors
 * — a rejection propagates through `Promise.all` while sibling workers keep running detached.
 */
async function runBounded<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const workers = new Array<Promise<void>>();
    for (let i = 0; i < workerCount; i++) {
        workers.push(
            (async () => {
                for (;;) {
                    const index = cursor++;
                    if (index >= items.length) return;
                    await fn(items[index]);
                }
            })(),
        );
    }
    await Promise.all(workers);
}
