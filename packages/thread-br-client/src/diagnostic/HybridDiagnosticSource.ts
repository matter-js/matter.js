/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, ImplementationError } from "@matter/general";
import type { DiagnosticResponse } from "./DiagnosticResponse.js";
import type { DiagnosticSource, QueryMulticastHandle, QueryMulticastOptions } from "./DiagnosticSource.js";

/** Which transport performs the diagnostic queries. */
export type DiagnosticDetailTransport = "coap" | "rest";

export interface HybridDiagnosticOptions {
    /** MeshCoP (CoAP-over-DTLS) source, when Thread credentials are available for the network. */
    coap?: DiagnosticSource;
    /** OTBR REST source, when a REST endpoint was probed for the network. */
    rest?: DiagnosticSource;
    /**
     * Preferred transport for diagnostic queries. Defaults to `"coap"`: the REST collection API
     * runs one BR-managed action per node and is markedly slower than direct CoAP unicast/multicast,
     * so CoAP is preferred whenever credentials exist. The non-preferred transport is used only when
     * the preferred one is absent.
     */
    detailTransport?: DiagnosticDetailTransport;
}

/**
 * A {@link DiagnosticSource} that composes the MeshCoP (CoAP) and OTBR REST sources and routes every
 * query to the configured preferred transport, falling back to the other only when the preferred is
 * absent for this network.
 *
 * CoAP is preferred by default because it queries nodes directly under our own timeout/window,
 * whereas the REST collection API delegates to the BR as async per-node actions (much slower). REST
 * is used when there are no Thread credentials for CoAP, or when explicitly selected via
 * {@link HybridDiagnosticOptions.detailTransport}.
 */
export class HybridDiagnosticSource implements DiagnosticSource {
    readonly #coap?: DiagnosticSource;
    readonly #rest?: DiagnosticSource;
    readonly #preferred: DiagnosticSource;

    constructor(options: HybridDiagnosticOptions) {
        this.#coap = options.coap;
        this.#rest = options.rest;
        const detailTransport = options.detailTransport ?? "coap";
        const preferred = detailTransport === "rest" ? (this.#rest ?? this.#coap) : (this.#coap ?? this.#rest);
        if (preferred === undefined) {
            throw new ImplementationError("HybridDiagnosticSource requires at least one of { coap, rest }");
        }
        this.#preferred = preferred;
    }

    get kind(): "meshcop" | "otbr-rest" {
        return this.#preferred.kind;
    }

    canQuery(extPanId: Bytes): boolean {
        // Must reflect the transport that will actually serve queries, since every op routes to it.
        return this.#preferred.canQuery(extPanId);
    }

    queryUnicast(target: { rloc16?: number; ip?: string }, tlvTypes: number[]): Promise<DiagnosticResponse> {
        return this.#preferred.queryUnicast(target, tlvTypes);
    }

    queryMulticast(scope: "ff03::1" | "ff03::2", opts: QueryMulticastOptions): QueryMulticastHandle {
        return this.#preferred.queryMulticast(scope, opts);
    }

    resetCounters(target: { rloc16?: number; ip?: string }, tlvTypes?: ReadonlyArray<number>): Promise<void> {
        return this.#preferred.resetCounters(target, tlvTypes);
    }
}
