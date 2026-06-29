/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { normalizeKeys } from "./caseNormalizer.js";
import { OtbrRestError } from "./OtbrRestError.js";

export interface OtbrLeaderData {
    partitionId: number;
    weighting: number;
    dataVersion: number;
    stableDataVersion: number;
    leaderRouterId: number;
}

export interface OtbrNodeInfo {
    baId: Uint8Array;
    state: string;
    numOfRouter: number;
    rlocAddress: string;
    extAddress: Uint8Array;
    networkName: string;
    rloc16: number;
    leaderData: OtbrLeaderData;
    extPanId: Uint8Array;
}

export interface OtbrDatasetHex {
    activeHex?: string;
    pendingHex?: string;
}

export interface OtbrRestClientOptions {
    host: string;
    port?: number;
    timeoutMs?: number;
}

const DEFAULT_PORT = 8081;
const DEFAULT_TIMEOUT_MS = 5000;
const HTTP_NO_CONTENT = 204;

interface FetchedJson {
    status: number;
    body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function expectString(record: Record<string, unknown>, key: string, where: string): string {
    const value = record[key];
    if (typeof value !== "string") {
        throw new OtbrRestError("rest_protocol", `${where}: missing or non-string field ${key}`);
    }
    return value;
}

function expectNumber(record: Record<string, unknown>, key: string, where: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new OtbrRestError("rest_protocol", `${where}: missing or non-numeric field ${key}`);
    }
    return value;
}

function expectRecord(record: Record<string, unknown>, key: string, where: string): Record<string, unknown> {
    const value = record[key];
    if (!isRecord(value)) {
        throw new OtbrRestError("rest_protocol", `${where}: missing or non-object field ${key}`);
    }
    return value;
}

function parseHexBytes(hex: string, expectedLen: number, where: string): Uint8Array {
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new OtbrRestError("rest_protocol", `${where}: not hex`);
    }
    if (hex.length !== expectedLen * 2) {
        throw new OtbrRestError("rest_protocol", `${where}: expected ${expectedLen} bytes, got ${hex.length / 2}`);
    }
    return Bytes.of(Bytes.fromHex(hex));
}

/**
 * Thin HTTP client for the OpenThread Border Router (OTBR) REST API.
 *
 * Wraps the OTBR REST endpoints under `/node` and `/diagnostics`. All methods
 * reject with {@link OtbrRestError} on network failure or a response that
 * violates the expected shape. IPv6 host literals are bracket-escaped
 * automatically; bare IPv4 hosts and hostnames are passed through unchanged.
 *
 * @example
 * ```ts
 * const client = new OtbrRestClient({ host: "fd12::1" });
 * const info = await client.getNode();
 * ```
 */
export class OtbrRestClient {
    readonly #baseUrl: string;
    readonly #timeoutMs: number;

    /**
     * @param opts - Connection parameters; `host` is required.
     */
    constructor(opts: OtbrRestClientOptions) {
        const port = opts.port ?? DEFAULT_PORT;
        const host = opts.host.includes(":") && !opts.host.startsWith("[") ? `[${opts.host}]` : opts.host;
        this.#baseUrl = `http://${host}:${port}`;
        this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    get baseUrl(): string {
        return this.#baseUrl;
    }

    /**
     * Fetch the current node summary from the OTBR `/node` endpoint.
     *
     * @returns Parsed node info with typed fields (binary fields as `Uint8Array`).
     * @throws {@link OtbrRestError} with code `"rest_unreachable"` on network error or timeout.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` when the response is
     *   not a valid JSON object or a required field is missing or has the wrong type.
     */
    async getNode(): Promise<OtbrNodeInfo> {
        const { body } = await this.#fetchJson("/node");
        if (!isRecord(body)) {
            throw new OtbrRestError("rest_protocol", "/node did not return a JSON object");
        }
        const where = "/node";
        const leaderRaw = expectRecord(body, "leaderData", where);
        const leaderData: OtbrLeaderData = {
            partitionId: expectNumber(leaderRaw, "partitionId", `${where}.leaderData`),
            weighting: expectNumber(leaderRaw, "weighting", `${where}.leaderData`),
            dataVersion: expectNumber(leaderRaw, "dataVersion", `${where}.leaderData`),
            stableDataVersion: expectNumber(leaderRaw, "stableDataVersion", `${where}.leaderData`),
            leaderRouterId: expectNumber(leaderRaw, "leaderRouterId", `${where}.leaderData`),
        };
        return {
            baId: parseHexBytes(expectString(body, "baId", where), 16, `${where}.baId`),
            state: expectString(body, "state", where),
            numOfRouter: expectNumber(body, "numOfRouter", where),
            rlocAddress: expectString(body, "rlocAddress", where),
            extAddress: parseHexBytes(expectString(body, "extAddress", where), 8, `${where}.extAddress`),
            networkName: expectString(body, "networkName", where),
            rloc16: expectNumber(body, "rloc16", where),
            leaderData,
            extPanId: parseHexBytes(expectString(body, "extPanId", where), 8, `${where}.extPanId`),
        };
    }

    /**
     * Fetch the raw diagnostics array from the OTBR `/diagnostics` endpoint.
     *
     * The response is returned as-is — callers are responsible for interpreting
     * the per-node objects. Use `OtbrRestDiagnosticSource` for a typed interface
     * that translates this payload into `DiagnosticResponse` values.
     *
     * @returns Array of raw node diagnostic objects as returned by the BR.
     * @throws {@link OtbrRestError} with code `"rest_unreachable"` on network error or timeout.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` when the response is not a JSON array.
     */
    async getDiagnostics(): Promise<unknown[]> {
        const { body } = await this.#fetchJson("/diagnostics");
        if (!Array.isArray(body)) {
            throw new OtbrRestError("rest_protocol", "/diagnostics did not return a JSON array");
        }
        return body;
    }

    /**
     * Fetch the active and pending dataset hex strings from the OTBR REST API.
     *
     * Each dataset is fetched independently from `/node/dataset/active` and
     * `/node/dataset/pending`. A `204 No Content` response means the dataset is
     * absent, in which case the corresponding field is omitted from the result.
     *
     * @returns Object with `activeHex` and/or `pendingHex` hex strings; fields
     *   are absent when the BR has no dataset of that type.
     * @throws {@link OtbrRestError} with code `"rest_unreachable"` on network error or timeout.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` on a non-2xx HTTP status.
     */
    async getDataset(): Promise<OtbrDatasetHex> {
        const active = await this.#fetchText("/node/dataset/active");
        const pending = await this.#fetchText("/node/dataset/pending");
        const out: OtbrDatasetHex = {};
        if (active !== undefined) out.activeHex = active;
        if (pending !== undefined) out.pendingHex = pending;
        return out;
    }

    /**
     * POST an action body to the OTBR `/api/actions` endpoint.
     *
     * Only available on camelCase (post-2024) OTBR builds — callers must guard
     * on `OtbrRestCapability.keyFormat === "camel"` before calling this method.
     *
     * @param body - The action payload (e.g. `{ action: "resetNetworkDiagCounterTask" }`).
     * @throws {@link OtbrRestError} with code `"rest_unreachable"` on network error.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` on a non-2xx response.
     */
    async resetDiagnosticCounters(body: Record<string, unknown>): Promise<void> {
        await this.#postActions(body);
    }

    /**
     * POST a `getEnergyScanTask` action to the OTBR `/api/actions` endpoint.
     *
     * Only available on camelCase (post-2024) OTBR builds — callers must guard
     * on `OtbrRestCapability.keyFormat === "camel"` before calling this method.
     *
     * @param body - The action payload (e.g. `{ action: "getEnergyScanTask" }`).
     * @throws {@link OtbrRestError} with code `"rest_unreachable"` on network error.
     * @throws {@link OtbrRestError} with code `"rest_protocol"` on a non-2xx response.
     */
    async getEnergyScanTask(body: Record<string, unknown>): Promise<void> {
        await this.#postActions(body);
    }

    async #postActions(body: Record<string, unknown>): Promise<void> {
        const url = `${this.#baseUrl}/api/actions`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        let response: Response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `POST /api/actions failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new OtbrRestError("rest_protocol", `POST /api/actions returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
    }

    async #fetchJson(path: string): Promise<FetchedJson> {
        const response = await this.#doFetch(path, "application/json");
        if (response.status === HTTP_NO_CONTENT) {
            return { status: response.status, body: null };
        }
        if (!response.ok) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
        const text = await response.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned non-JSON body`, {
                cause: err instanceof Error ? err : undefined,
            });
        }
        return { status: response.status, body: normalizeKeys(parsed) };
    }

    async #fetchText(path: string): Promise<string | undefined> {
        const response = await this.#doFetch(path, "text/plain");
        if (response.status === HTTP_NO_CONTENT) return undefined;
        if (!response.ok) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
        return response.text();
    }

    async #doFetch(path: string, accept: string): Promise<Response> {
        const url = `${this.#baseUrl}${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        try {
            return await fetch(url, {
                method: "GET",
                headers: { Accept: accept },
                signal: controller.signal,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `GET ${path} failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            clearTimeout(timer);
        }
    }
}
