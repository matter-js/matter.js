/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "@matter/general";

/**
 * Snapshot of an OTBR REST endpoint as observed by {@link OtbrRestProbe}.
 *
 * `keyFormat` reflects the case convention the BR's REST surface uses on the
 * wire (older OTBR builds = pascal, post-2024 builds = camel). The probe
 * detects this from the key casing of the `/node` response.
 */
export interface OtbrRestCapability {
    baseUrl: string;
    keyFormat: "camel" | "pascal";
    probedAt: number;
    networkName: string;
    extPanId: Bytes;

    /**
     * Which diagnostics REST flavor the BR serves: `"collection"` (post-2024 action model under
     * `/api/diagnostics`), `"legacy"` (the `GET /diagnostics` snapshot), or `"none"` (neither —
     * REST cannot serve diagnostics, so the consumer must fall back to MeshCoP).
     */
    diagnosticsApi: "legacy" | "collection" | "none";
}
