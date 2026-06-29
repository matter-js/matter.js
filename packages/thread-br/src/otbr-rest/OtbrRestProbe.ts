/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Logger } from "@matter/main";
import type { OtbrRestCapability } from "./OtbrRestCapability.js";
import { OtbrRestClient } from "./OtbrRestClient.js";
import { OtbrRestError } from "./OtbrRestError.js";

const logger = Logger.get("OtbrRestProbe");

const DEFAULT_PROBE_PORT = 8081;
const DEFAULT_PROBE_TIMEOUT_MS = 1000;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

export class OtbrRestProbe {
    /**
     * Probe a host:port for OTBR REST. Returns the detected capability or
     * `null` if the endpoint is not OTBR or not reachable within
     * `timeoutMs`. Detection mirrors python-otbr-api: a 200 on
     * `/api/actions` indicates the modern camelCase backend, a 404 the
     * legacy pascalCase backend; everything else is "not OTBR".
     */
    static async probe(
        host: string,
        port: number = DEFAULT_PROBE_PORT,
        timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
    ): Promise<OtbrRestCapability | null> {
        const client = new OtbrRestClient({ host, port, timeoutMs });
        const baseUrl = client.baseUrl;
        logger.debug(`[ThreadDiag] probe START ${baseUrl} timeout=${timeoutMs}ms`);

        const keyFormat = await detectCase(baseUrl, timeoutMs);
        if (keyFormat === null) {
            logger.debug(`[ThreadDiag] probe MISS ${baseUrl} (case detect failed)`);
            return null;
        }

        try {
            const node = await client.getNode();
            logger.debug(
                `[ThreadDiag] probe OK ${baseUrl} keyFormat=${keyFormat} xp=${Bytes.toHex(node.extPanId).toUpperCase()} network="${node.networkName}"`,
            );
            return {
                baseUrl,
                keyFormat,
                probedAt: Date.now(),
                networkName: node.networkName,
                extPanId: node.extPanId,
            };
        } catch (err) {
            if (err instanceof OtbrRestError) {
                logger.debug(`[ThreadDiag] probe MISS ${baseUrl} /node ${err.code} (${err.message})`);
                return null;
            }
            throw err;
        }
    }
}

async function detectCase(baseUrl: string, timeoutMs: number): Promise<"camel" | "pascal" | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${baseUrl}/api/actions`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (response.status === HTTP_OK) return "camel";
        if (response.status === HTTP_NOT_FOUND) return "pascal";
        logger.debug(`probe of ${baseUrl} rejected: /api/actions returned ${response.status}`);
        return null;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.debug(`probe of ${baseUrl} rejected: /api/actions ${message}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}
