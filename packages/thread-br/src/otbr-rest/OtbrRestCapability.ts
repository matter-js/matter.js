/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Snapshot of an OTBR REST endpoint as observed by {@link OtbrRestProbe}.
 *
 * `keyFormat` reflects the case convention the BR's REST surface uses on the
 * wire (older OTBR builds = pascal, post-2024 builds = camel). The probe
 * detects this from the presence/absence of `/api/actions` — see
 * python-otbr-api `_async_detect_case`.
 */
export interface OtbrRestCapability {
    baseUrl: string;
    keyFormat: "camel" | "pascal";
    apiVersion?: string;
    probedAt: number;
    networkName: string;
    extPanId: Uint8Array;
}
