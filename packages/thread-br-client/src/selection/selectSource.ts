/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import type { ThreadCredentialsRegistry } from "../credentials/ThreadCredentialsRegistry.js";
import type { ThreadNetworkCredentials } from "../credentials/ThreadNetworkCredentials.js";
import type { DiagnosticDetailTransport, DiagnosticSource } from "../diagnostic/index.js";
import { HybridDiagnosticSource } from "../diagnostic/index.js";
import type { BorderRouterEntry } from "../discovery/BorderRouterEntry.js";
import type { OtbrRestCapability } from "../otbr-rest/OtbrRestCapability.js";

export interface SelectSourceOpts {
    br: BorderRouterEntry;
    credentials: Pick<ThreadCredentialsRegistry, "getCredentials">;
    /** Keyed by `Bytes.toHex(extPanId)` (lowercase). */
    restCapabilities: ReadonlyMap<string, OtbrRestCapability>;
    otbrRestEnabled: boolean;
    /** Factory for the REST source (caller injects to avoid cyclic deps). */
    makeRestSource: (cap: OtbrRestCapability) => DiagnosticSource;
    /** Factory for the MeshCoP source (caller injects). */
    makeMeshcopSource: (creds: ThreadNetworkCredentials, br: BorderRouterEntry) => DiagnosticSource;
    /**
     * Preferred transport when BOTH REST and MeshCoP are available for this BR. Defaults to `"coap"`
     * — direct CoAP queries are much faster than the BR-managed REST action model, which is used
     * only when no credentials exist or `"rest"` is selected.
     */
    detailTransport?: DiagnosticDetailTransport;
}

/**
 * Pick the diagnostic source for a Border Router:
 *   - REST capability (if `otbrRestEnabled`) AND registered credentials → {@link HybridDiagnosticSource}
 *     routing per `detailTransport` (default CoAP).
 *   - Only one available → that source.
 *   - Neither → undefined (Mode B observation only).
 *
 * Returns undefined when the BR carries no `extendedPanIdHex`, since both lookups key on it.
 */
export function selectSource(opts: SelectSourceOpts): DiagnosticSource | undefined {
    const { br, credentials, restCapabilities, otbrRestEnabled, makeRestSource, makeMeshcopSource } = opts;
    if (br.extendedPanIdHex === undefined) return undefined;

    const extPanId = Bytes.of(Bytes.fromHex(br.extendedPanIdHex));
    const lookupKey = Bytes.toHex(extPanId);

    const cap = otbrRestEnabled ? restCapabilities.get(lookupKey) : undefined;
    // A cap with diagnosticsApi "none" serves REST but no diagnostics endpoint — not usable here.
    const rest = cap !== undefined && cap.diagnosticsApi !== "none" ? makeRestSource(cap) : undefined;

    const creds = credentials.getCredentials(extPanId);
    const coap = creds !== undefined ? makeMeshcopSource(creds, br) : undefined;

    if (rest !== undefined && coap !== undefined) {
        return new HybridDiagnosticSource({ coap, rest, detailTransport: opts.detailTransport });
    }
    return coap ?? rest;
}
