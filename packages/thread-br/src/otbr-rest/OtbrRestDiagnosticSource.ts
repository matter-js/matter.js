/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Logger, Observable } from "@matter/main";
import type { DiagnosticResponse } from "../diagnostic/DiagnosticResponse.js";
import { DEFAULT_RESET_TLV_TYPES } from "../diagnostic/DiagnosticSource.js";
import type { DiagnosticSource, QueryMulticastHandle, QueryMulticastOptions } from "../diagnostic/DiagnosticSource.js";
import type { OtbrRestCapability } from "./OtbrRestCapability.js";
import type { OtbrRestClient } from "./OtbrRestClient.js";
import { OtbrRestError } from "./OtbrRestError.js";
import { translateNodeJson } from "./translation.js";

const logger = Logger.get("OtbrRestDiagnosticSource");

type ClientLike = Pick<OtbrRestClient, "getDiagnostics" | "getNode" | "resetDiagnosticCounters">;

/**
 * {@link DiagnosticSource} implementation that wraps the OTBR REST `/diagnostics`
 * endpoint.
 *
 * Unlike the MeshCoP path (DTLS + CoAP), this source requires no DTLS handshake;
 * the BR exposes a pre-collected mesh-wide diagnostic snapshot over plain HTTP.
 * TLV type filtering and multicast scoping are not supported on the wire — the
 * full snapshot is always fetched and filtered client-side.
 *
 * Bind one instance per discovered OTBR REST endpoint. The `capability` object
 * from {@link OtbrRestProbe} records which network this source covers.
 */
export class OtbrRestDiagnosticSource implements DiagnosticSource {
    readonly kind = "otbr-rest" as const;

    readonly #client: ClientLike;
    readonly #capability: OtbrRestCapability;

    /**
     * @param client - REST client (or compatible duck type) for the target BR.
     * @param capability - Probed metadata identifying the network this source covers.
     */
    constructor(client: ClientLike, capability: OtbrRestCapability) {
        this.#client = client;
        this.#capability = capability;
    }

    /**
     * Returns `true` when `extPanId` matches the network this source was probed for.
     *
     * @param extPanId - 8-byte Extended PAN ID of the network to query.
     */
    canQuery(extPanId: Uint8Array): boolean {
        return Bytes.areEqual(extPanId, this.#capability.extPanId);
    }

    /**
     * Query diagnostics for a single mesh node by RLOC16.
     *
     * Fetches the full `/diagnostics` snapshot from the BR and returns the entry
     * matching `target.rloc16`. IP-only targets are not supported via REST — the
     * OTBR per-RLOC16 endpoint is not universally available.
     *
     * @param target - Must include `rloc16`; `ip` without `rloc16` is rejected.
     * @param _tlvTypes - Ignored; REST returns the BR's full snapshot unconditionally.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` when `rloc16` is
     *   missing, when an ip-only target is supplied, or when no entry matches `rloc16`.
     * @throws {@link OtbrRestError} when the underlying REST fetch fails.
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
        // Per-RLOC16 endpoint (`/diagnostics/<rloc16>`) is not universally
        // supported — fetch the full mesh dump and filter client-side.
        // tlvTypes is ignored: REST returns the BR's full diagnostic snapshot
        // with no per-TLV filtering on the wire.
        const list = await this.#client.getDiagnostics();
        for (const entry of list) {
            const decoded = translateNodeJson(entry);
            if (decoded.rloc16 === target.rloc16) return decoded;
        }
        throw new OtbrRestError("rest_protocol", `rloc16 0x${target.rloc16.toString(16)} not found in /diagnostics`);
    }

    /**
     * Stream all mesh-node diagnostics from the OTBR `/diagnostics` endpoint.
     *
     * Because the REST surface returns a pre-collected snapshot in a single HTTP
     * response, multicast scope and `opts.windowMs` have no effect — all nodes are
     * emitted in one burst and `done` resolves immediately after. The returned
     * handle is still conformant to {@link QueryMulticastHandle}; callers may
     * call `close()` before `done` resolves with no ill effect.
     *
     * @param _scope - Ignored; REST has no per-scope filtering.
     * @param _opts - Ignored; see above.
     * @returns Handle with `onNode`, `onError`, `done`, and `close`.
     */
    queryMulticast(_scope: "ff03::1" | "ff03::2", _opts: QueryMulticastOptions): QueryMulticastHandle {
        // scope/tlvTypes/windowMs are no-ops for REST: the BR has already
        // collected diagnostics for the whole mesh and exposes the snapshot
        // via /diagnostics. REST emits all nodes in a single burst and resolves
        // `done` immediately after — windowMs is irrelevant.
        const onNode = new Observable<[DiagnosticResponse]>();
        const onError = new Observable<[Error]>();
        let resolveDone!: () => void;
        let rejectDone!: (err: Error) => void;
        const done = new Promise<void>((resolve, reject) => {
            resolveDone = resolve;
            rejectDone = reject;
        });

        const start = Date.now();
        logger.debug(`[ThreadDiag] REST GET /diagnostics ${this.#capability.baseUrl}`);
        void (async () => {
            try {
                const list = await this.#client.getDiagnostics();
                for (const entry of list) {
                    onNode.emit(translateNodeJson(entry));
                }
                logger.debug(`[ThreadDiag] REST /diagnostics OK nodes=${list.length} duration=${Date.now() - start}ms`);
                resolveDone();
            } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                onError.emit(e);
                rejectDone(e);
            }
        })();

        return {
            onNode,
            onError,
            done,
            close: async () => {
                // The fetch is in-flight — let it complete; ignore the outcome.
                await done.catch(() => {});
            },
        };
    }

    /**
     * Zero MAC and MLE counters on a single mesh node via the OTBR REST API.
     *
     * Posts a `resetNetworkDiagCounterTask` action to `/api/actions`. Only
     * available on camelCase OTBR backends (post-2024 builds detected as
     * `keyFormat === "camel"` during probing). Throws {@link OtbrRestError}
     * with code `"rest_disabled"` when the backend does not support this
     * endpoint. Mutating but low-risk — counters only, no network state altered.
     *
     * @param _target - Accepted for interface compatibility; REST resets all
     *   nodes atomically, so target is not forwarded on the wire.
     * @param _tlvTypes - Accepted for interface compatibility; the REST action
     *   always resets all diagnostic counters regardless of tlvTypes.
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
