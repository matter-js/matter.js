/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import type { ThreadCredentialsRegistry } from "../credentials/ThreadCredentialsRegistry.js";
import type { ThreadNetworkCredentials } from "../credentials/ThreadNetworkCredentials.js";
import type { DiagnosticSource } from "../diagnostic/DiagnosticSource.js";
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
}

/**
 * Pick the diagnostic source per spec §4.10 priority:
 *   1. `otbrRestEnabled` AND `restCapabilities` has an entry for this BR's extPanId → REST.
 *   2. Credentials registered for this BR's extPanId → MeshCoP.
 *   3. Neither → undefined (Mode B observation only).
 *
 * Returns undefined when the BR carries no `extendedPanIdHex`, since both lookups
 * key on it.
 */
export function selectSource(opts: SelectSourceOpts): DiagnosticSource | undefined {
    const { br, credentials, restCapabilities, otbrRestEnabled, makeRestSource, makeMeshcopSource } = opts;
    if (br.extendedPanIdHex === undefined) return undefined;

    const extPanId = Bytes.of(Bytes.fromHex(br.extendedPanIdHex));
    const lookupKey = Bytes.toHex(extPanId);

    if (otbrRestEnabled) {
        const cap = restCapabilities.get(lookupKey);
        if (cap !== undefined) return makeRestSource(cap);
    }

    const creds = credentials.getCredentials(extPanId);
    if (creds !== undefined) return makeMeshcopSource(creds, br);

    return undefined;
}
