/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Logger, Seconds } from "@matter/general";
import type { OtbrRestCapability } from "./OtbrRestCapability.js";
import { OtbrRestClient } from "./OtbrRestClient.js";
import { OtbrRestError } from "./OtbrRestError.js";

const logger = Logger.get("OtbrRestProbe");

const DEFAULT_PROBE_PORT = 8081;
const DEFAULT_PROBE_TIMEOUT = Seconds(1);

export class OtbrRestProbe {
    /**
     * Probe a host:port for OTBR REST. Returns the detected capability or
     * `null` if the endpoint is not OTBR or not reachable within `timeoutMs`.
     *
     * `GET /node` both confirms the endpoint is OTBR and reveals its key casing:
     * legacy builds emit PascalCase keys, post-2024 builds camelCase. Anything that
     * is not a JSON object carrying `networkName` and `extPanId` is treated as "not
     * OTBR". A status-only probe of the diagnostics endpoints then records which
     * flavor the BR serves (`diagnosticsApi`: legacy | collection | none).
     */
    static async probe(
        host: string,
        port: number = DEFAULT_PROBE_PORT,
        timeoutMs: number = DEFAULT_PROBE_TIMEOUT,
    ): Promise<OtbrRestCapability | null> {
        const client = new OtbrRestClient({ host, port, timeoutMs });
        const baseUrl = client.baseUrl;
        logger.debug(`probe START ${baseUrl} timeout=${timeoutMs}ms`);

        try {
            const { keyFormat, networkName, extPanId } = await client.probeNode();
            const diagnosticsApi = await client.detectDiagnosticsApi();
            logger.debug(
                `probe OK ${baseUrl} keyFormat=${keyFormat} diagnosticsApi=${diagnosticsApi} xp=${Bytes.toHex(extPanId).toUpperCase()} network="${networkName}"`,
            );
            return { baseUrl, keyFormat, probedAt: Date.now(), networkName, extPanId, diagnosticsApi };
        } catch (err) {
            if (err instanceof OtbrRestError) {
                logger.debug(`probe MISS ${baseUrl} /node ${err.code} (${err.message})`);
                return null;
            }
            throw err;
        }
    }
}
