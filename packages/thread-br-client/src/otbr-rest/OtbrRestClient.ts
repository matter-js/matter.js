/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, type Duration, ImplementationError, Millis, Seconds, Time, Timer } from "@matter/general";
import { OperationalDataset } from "@matter/protocol";
import { detectKeyFormat, normalizeKeys } from "./caseNormalizer.js";
import { OtbrRestError, type OtbrRestErrorCode } from "./OtbrRestError.js";
import { parseHexBytes, parseRloc16 } from "./parseHexBytes.js";

export interface OtbrLeaderData {
    partitionId: number;
    weighting: number;
    dataVersion: number;
    stableDataVersion: number;
    leaderRouterId: number;
}

export interface OtbrNodeInfo {
    baId: Bytes;
    state: string;
    /** Router count. Undefined on builds that omit both `numOfRouter` and its post-2024 alias `routerCount`. */
    numOfRouter?: number;
    rlocAddress: string;
    extAddress: Bytes;
    networkName: string;
    rloc16: number;
    leaderData: OtbrLeaderData;
    extPanId: Bytes;
}

export interface OtbrDatasetHex {
    activeHex?: string;
    pendingHex?: string;
}

/**
 * A joiner entry to add to the on-BR commissioner via `POST /node/commissioner/joiner`.
 *
 * `pskd` (the joiner passphrase) is required; provide at most one of `eui64`
 * (EUI-64 hex, or `"*"` for any device) or `discerner` (OpenThread joiner
 * discerner, e.g. `"0x123/12"`).
 */
export interface OtbrJoiner {
    pskd: string;
    eui64?: string;
    discerner?: string;
    timeoutSeconds?: number;
}

export interface OtbrRestClientOptions {
    host: string;
    port?: number;
    timeoutMs?: number;
}

const DEFAULT_PORT = 8081;
const DEFAULT_TIMEOUT = Seconds(5);
const HTTP_NO_CONTENT = 204;

/**
 * Map a non-2xx HTTP status onto an {@link OtbrRestErrorCode}, mirroring
 * python-otbr-api's error classification: 404 = endpoint unsupported by this
 * firmware, 405 = operation not allowed, 409 = conflict (e.g. dataset set while
 * Thread is active). Everything else is a generic protocol error.
 */
function errorCodeForStatus(status: number): OtbrRestErrorCode {
    switch (status) {
        case 404:
            return "rest_unsupported";
        case 405:
            return "rest_not_allowed";
        case 409:
            return "rest_conflict";
        default:
            return "rest_protocol";
    }
}

interface FetchedJson {
    status: number;
    body: unknown;
    keyFormat: "camel" | "pascal" | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read a collection response as an array, tolerating both the bare-array form and the JSON:API
 * envelope `{ data: [...] }` that some OTBR builds return depending on the negotiated media type.
 */
function asCollectionArray(body: unknown, where: string): unknown[] {
    if (Array.isArray(body)) return body;
    if (isRecord(body) && Array.isArray(body["data"])) return body["data"];
    throw new OtbrRestError("rest_protocol", `${where} did not return a JSON array`);
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

/** First finite number found under any of `keys`, else `undefined`. */
function optionalNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
}

function expectRloc16(record: Record<string, unknown>, where: string): number {
    const parsed = parseRloc16(record["rloc16"]);
    if (parsed === undefined) {
        throw new OtbrRestError("rest_protocol", `${where}: missing or invalid field rloc16`);
    }
    return parsed;
}

function expectRecord(record: Record<string, unknown>, key: string, where: string): Record<string, unknown> {
    const value = record[key];
    if (!isRecord(value)) {
        throw new OtbrRestError("rest_protocol", `${where}: missing or non-object field ${key}`);
    }
    return value;
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
    readonly #timeout: Duration;

    /**
     * @param opts - Connection parameters; `host` is required.
     */
    constructor(opts: OtbrRestClientOptions) {
        const port = opts.port ?? DEFAULT_PORT;
        const host = opts.host.includes(":") && !opts.host.startsWith("[") ? `[${opts.host}]` : opts.host;
        this.#baseUrl = `http://${host}:${port}`;
        this.#timeout = opts.timeoutMs !== undefined ? Millis(opts.timeoutMs) : DEFAULT_TIMEOUT;
    }

    get baseUrl(): string {
        return this.#baseUrl;
    }

    /**
     * Fetch the current node summary from the OTBR `/node` endpoint.
     *
     * @returns Parsed node info with typed fields (binary fields as `Bytes`).
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
            baId: parseHexBytes(expectString(body, "baId", where), `${where}.baId`, 16),
            state: expectString(body, "state", where),
            numOfRouter: optionalNumber(body, "numOfRouter", "routerCount"),
            rlocAddress: expectString(body, "rlocAddress", where),
            extAddress: parseHexBytes(expectString(body, "extAddress", where), `${where}.extAddress`, 8),
            networkName: expectString(body, "networkName", where),
            rloc16: expectRloc16(body, where),
            leaderData,
            extPanId: parseHexBytes(expectString(body, "extPanId", where), `${where}.extPanId`, 8),
        };
    }

    /**
     * Lightweight probe of the `/node` endpoint for {@link OtbrRestProbe}.
     *
     * Fetches `/node` once and returns only the fields needed to identify an
     * OTBR REST surface — the observed key casing plus the network name and
     * Extended PAN ID. Unlike {@link getNode} it does not validate the full
     * node schema, so a build that reshapes non-essential fields still probes
     * cleanly.
     *
     * @throws {@link OtbrRestError} `"rest_protocol"` when the response is not an
     *   OTBR node object or lacks `networkName`/`extPanId`.
     */
    async probeNode(): Promise<{ keyFormat: "camel" | "pascal"; networkName: string; extPanId: Bytes }> {
        const { body, keyFormat } = await this.#fetchJson("/node");
        if (!isRecord(body) || keyFormat === null) {
            throw new OtbrRestError("rest_protocol", "/node did not return an OTBR node object");
        }
        return {
            keyFormat,
            networkName: expectString(body, "networkName", "/node"),
            extPanId: parseHexBytes(expectString(body, "extPanId", "/node"), "/node.extPanId", 8),
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
     * Fetch the node role from `/node/state` (e.g. `"router"`, `"leader"`, `"child"`, `"disabled"`).
     *
     * @throws {@link OtbrRestError} `"rest_unreachable"` on network error, `"rest_protocol"` on a
     *   non-string body.
     */
    async getState(): Promise<string> {
        return this.#getJsonString("/node/state");
    }

    /**
     * Fetch the Thread network name from `/node/network-name`.
     */
    async getNetworkName(): Promise<string> {
        return this.#getJsonString("/node/network-name");
    }

    /**
     * Fetch the node's Routing Locator (RLOC) IPv6 address from `/node/rloc`.
     */
    async getRloc(): Promise<string> {
        return this.#getJsonString("/node/rloc");
    }

    /**
     * Fetch the 16-bit RLOC from `/node/rloc16`.
     */
    async getRloc16(): Promise<number> {
        return this.#getJsonNumber("/node/rloc16");
    }

    /**
     * Fetch the number of routers in the Thread network from `/node/num-of-router`.
     */
    async getNumOfRouter(): Promise<number> {
        return this.#getJsonNumber("/node/num-of-router");
    }

    /**
     * Fetch the 8-byte IEEE EUI-64 extended address from `/node/ext-address`.
     */
    async getExtAddress(): Promise<Bytes> {
        return parseHexBytes(await this.#getJsonString("/node/ext-address"), "/node/ext-address", 8);
    }

    /**
     * Fetch the 8-byte Extended PAN ID from `/node/ext-panid`.
     */
    async getExtPanId(): Promise<Bytes> {
        return parseHexBytes(await this.#getJsonString("/node/ext-panid"), "/node/ext-panid", 8);
    }

    /**
     * Fetch the 16-byte Border Agent ID from `/node/ba-id`.
     *
     * @throws {@link OtbrRestError} `"rest_unsupported"` on older firmware that lacks this endpoint (404).
     */
    async getBorderAgentId(): Promise<Bytes> {
        return parseHexBytes(await this.#getJsonString("/node/ba-id"), "/node/ba-id", 16);
    }

    /**
     * Fetch the leader data record from `/node/leader-data`.
     */
    async getLeaderData(): Promise<OtbrLeaderData> {
        const { body } = await this.#fetchJson("/node/leader-data");
        if (!isRecord(body)) {
            throw new OtbrRestError("rest_protocol", "/node/leader-data did not return a JSON object");
        }
        const where = "/node/leader-data";
        return {
            partitionId: expectNumber(body, "partitionId", where),
            weighting: expectNumber(body, "weighting", where),
            dataVersion: expectNumber(body, "dataVersion", where),
            stableDataVersion: expectNumber(body, "stableDataVersion", where),
            leaderRouterId: expectNumber(body, "leaderRouterId", where),
        };
    }

    /**
     * Fetch and decode the active Operational Dataset from `/node/dataset/active`.
     *
     * @returns The decoded dataset, or `undefined` when the BR has no active dataset (204).
     */
    async getActiveDataset(): Promise<OperationalDataset | undefined> {
        return this.#getDataset("/node/dataset/active");
    }

    /**
     * Fetch and decode the pending Operational Dataset from `/node/dataset/pending`.
     *
     * @returns The decoded dataset, or `undefined` when the BR has no pending dataset (204).
     */
    async getPendingDataset(): Promise<OperationalDataset | undefined> {
        return this.#getDataset("/node/dataset/pending");
    }

    /**
     * Fetch the RCP/co-processor version string from `/node/coprocessor/version`.
     *
     * @throws {@link OtbrRestError} `"rest_unsupported"` on older firmware that lacks this endpoint (404).
     */
    async getCoprocessorVersion(): Promise<string> {
        return this.#getJsonString("/node/coprocessor/version");
    }

    /**
     * Fetch the on-BR commissioner state from `/node/commissioner/state`.
     *
     * @throws {@link OtbrRestError} `"rest_unsupported"` on firmware without a built-in commissioner (404).
     */
    async getCommissionerState(): Promise<string> {
        return this.#getJsonString("/node/commissioner/state");
    }

    /**
     * Fetch the list of pending joiners from `/node/commissioner/joiner`.
     *
     * The entries are returned as-is (keys normalized to camelCase); callers
     * interpret the per-joiner objects.
     *
     * @throws {@link OtbrRestError} `"rest_unsupported"` on firmware without a built-in commissioner (404).
     */
    async getJoiners(): Promise<unknown[]> {
        const { body } = await this.#fetchJson("/node/commissioner/joiner");
        if (!Array.isArray(body)) {
            throw new OtbrRestError("rest_protocol", "/node/commissioner/joiner did not return a JSON array");
        }
        return body;
    }

    /**
     * Enable or disable the Thread interface via `PUT /node/state`.
     *
     * @throws {@link OtbrRestError} `"rest_conflict"` when the BR rejects the transition (409).
     */
    async setState(enable: boolean): Promise<void> {
        await this.#mutate("PUT", "/node/state", {
            contentType: "application/json",
            body: JSON.stringify(enable ? "enable" : "disable"),
        });
    }

    /**
     * Set the active Operational Dataset via `PUT /node/dataset/active`.
     *
     * @param dataset - An {@link OperationalDataset} (encoded to TLV hex) or a raw TLV hex string.
     * @throws {@link OtbrRestError} `"rest_conflict"` when Thread is active and the active
     *   dataset cannot be replaced in place (409) — use {@link setPendingDataset} instead.
     */
    async setActiveDataset(dataset: OperationalDataset | string): Promise<void> {
        await this.#putDataset("/node/dataset/active", dataset);
    }

    /**
     * Clear the active Operational Dataset via `DELETE /node/dataset/active`.
     */
    async deleteActiveDataset(): Promise<void> {
        await this.#mutate("DELETE", "/node/dataset/active");
    }

    /**
     * Set the pending Operational Dataset via `PUT /node/dataset/pending`.
     *
     * @param dataset - An {@link OperationalDataset} (encoded to TLV hex) or a raw TLV hex string.
     */
    async setPendingDataset(dataset: OperationalDataset | string): Promise<void> {
        await this.#putDataset("/node/dataset/pending", dataset);
    }

    /**
     * Clear the pending Operational Dataset via `DELETE /node/dataset/pending`.
     */
    async deletePendingDataset(): Promise<void> {
        await this.#mutate("DELETE", "/node/dataset/pending");
    }

    /**
     * Factory-reset the Thread node via `DELETE /node`.
     *
     * @throws {@link OtbrRestError} `"rest_not_allowed"` when the firmware disallows factory reset (405);
     *   `"rest_conflict"` when the interface is in a state that forbids it (409).
     */
    async factoryReset(): Promise<void> {
        await this.#mutate("DELETE", "/node");
    }

    /**
     * Enable or disable the on-BR commissioner via `PUT /node/commissioner/state`.
     *
     * @throws {@link OtbrRestError} `"rest_conflict"` when the BR is not active (409);
     *   `"rest_unsupported"` on firmware without a built-in commissioner (404).
     */
    async setCommissionerState(enable: boolean): Promise<void> {
        await this.#mutate("PUT", "/node/commissioner/state", {
            contentType: "application/json",
            body: JSON.stringify(enable ? "enable" : "disable"),
        });
    }

    /**
     * Add a joiner to the on-BR commissioner via `POST /node/commissioner/joiner`.
     *
     * Provide at most one of `eui64` or `discerner`; omit both to match any device.
     *
     * @throws {@link ImplementationError} when both `eui64` and `discerner` are provided.
     * @throws {@link OtbrRestError} `"rest_conflict"` when the commissioner is not active (409).
     */
    async addJoiner(joiner: OtbrJoiner): Promise<void> {
        if (joiner.eui64 !== undefined && joiner.discerner !== undefined) {
            throw new ImplementationError("addJoiner: provide at most one of eui64 or discerner");
        }
        const payload: Record<string, unknown> = { pskd: joiner.pskd };
        if (joiner.eui64 !== undefined) payload.eui64 = joiner.eui64;
        if (joiner.discerner !== undefined) payload.discerner = joiner.discerner;
        if (joiner.timeoutSeconds !== undefined) payload.timeout = joiner.timeoutSeconds;
        await this.#mutate("POST", "/node/commissioner/joiner", {
            contentType: "application/json",
            body: JSON.stringify(payload),
        });
    }

    /**
     * Remove a joiner from the on-BR commissioner via `DELETE /node/commissioner/joiner`.
     *
     * @param joinerId - EUI-64 hex, a discerner (`"0x…/len"`), or `"*"` to remove all joiners.
     * @throws {@link OtbrRestError} `"rest_conflict"` when the commissioner is not active (409).
     */
    async removeJoiner(joinerId: string): Promise<void> {
        await this.#mutate("DELETE", "/node/commissioner/joiner", {
            contentType: "application/json",
            body: JSON.stringify(joinerId),
        });
    }

    async #getDataset(path: string): Promise<OperationalDataset | undefined> {
        const hex = await this.#fetchText(path);
        if (hex === undefined || hex.length === 0) return undefined;
        try {
            return OperationalDataset.decode(hex);
        } catch (err) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned an undecodable dataset`, {
                cause: err instanceof Error ? err : undefined,
            });
        }
    }

    async #putDataset(path: string, dataset: OperationalDataset | string): Promise<void> {
        const hex = typeof dataset === "string" ? dataset : Bytes.toHex(OperationalDataset.encode(dataset));
        await this.#mutate("PUT", path, { contentType: "text/plain", body: hex });
    }

    async #getJsonString(path: string): Promise<string> {
        const { body } = await this.#fetchJson(path);
        if (typeof body !== "string") {
            throw new OtbrRestError("rest_protocol", `GET ${path} did not return a string`);
        }
        return body;
    }

    async #getJsonNumber(path: string): Promise<number> {
        const { body } = await this.#fetchJson(path);
        if (typeof body !== "number" || !Number.isFinite(body)) {
            throw new OtbrRestError("rest_protocol", `GET ${path} did not return a number`);
        }
        return body;
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

    /**
     * POST a JSON:API action task to `/api/actions` and return the created action's id.
     *
     * The collection-based (post-2024) OTBR REST API models network-diagnostic queries and
     * device discovery as asynchronous actions. Poll {@link getAction} until the returned id
     * reaches a terminal status.
     *
     * @param type - Action type, e.g. `"getNetworkDiagnosticTask"` or `"updateDeviceCollectionTask"`.
     * @param attributes - Task attributes (destination, types, timeout, …).
     * @throws {@link OtbrRestError} `"rest_protocol"` when the response carries no action id.
     */
    async postAction(type: string, attributes: Record<string, unknown>): Promise<string> {
        const body = await this.#postJson("/api/actions", { data: [{ type, attributes }] });
        const data = isRecord(body) ? body["data"] : undefined;
        const first = Array.isArray(data) ? data[0] : undefined;
        const id = isRecord(first) ? first["id"] : undefined;
        if (typeof id !== "string") {
            throw new OtbrRestError("rest_protocol", "POST /api/actions returned no action id");
        }
        return id;
    }

    /**
     * GET an action's current status and, once completed, the id of its result item in the
     * diagnostics collection (`relationships.result.data.id`).
     *
     * @param id - Action id returned by {@link postAction}.
     */
    async getAction(id: string): Promise<{ status: string; resultId?: string }> {
        const path = `/api/actions/${id}`;
        const response = await this.#doFetch(path, "application/vnd.api+json");
        if (!response.ok) {
            throw new OtbrRestError(errorCodeForStatus(response.status), `GET ${path} returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
        let parsed: unknown;
        try {
            parsed = normalizeKeys(JSON.parse(response.text));
        } catch (err) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned non-JSON body`, {
                cause: err instanceof Error ? err : undefined,
            });
        }
        const data = isRecord(parsed) ? parsed["data"] : undefined;
        const attributes = isRecord(data) ? data["attributes"] : undefined;
        const status = isRecord(attributes) ? attributes["status"] : undefined;
        if (typeof status !== "string") {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned no action status`);
        }
        const relationships = isRecord(data) ? data["relationships"] : undefined;
        const result = isRecord(relationships) ? relationships["result"] : undefined;
        const resultData = isRecord(result) ? result["data"] : undefined;
        const resultId = isRecord(resultData) && typeof resultData["id"] === "string" ? resultData["id"] : undefined;
        return { status, resultId };
    }

    /**
     * GET the aggregated network-diagnostics collection (`/api/diagnostics`). Keys are normalized;
     * feed each entry to {@link translateNodeJson}.
     */
    async getDiagnosticsCollection(): Promise<unknown[]> {
        const { body } = await this.#fetchJson("/api/diagnostics");
        return asCollectionArray(body, "/api/diagnostics");
    }

    /** GET the discovered-device directory (`/api/devices`). */
    async listDevices(): Promise<unknown[]> {
        const { body } = await this.#fetchJson("/api/devices");
        return asCollectionArray(body, "/api/devices");
    }

    /** DELETE the diagnostics result cache so a subsequent collection reflects only fresh results. */
    async clearDiagnostics(): Promise<void> {
        await this.#mutate("DELETE", "/api/diagnostics");
    }

    /**
     * Detect which diagnostics REST flavor the BR serves: `"collection"` (post-2024 action model
     * under `/api/diagnostics`), `"legacy"` (the pre-collection `GET /diagnostics` snapshot), or
     * `"none"` (neither — diagnostics must go via MeshCoP).
     *
     * Uses the endpoint's HTTP status only (a 404 is a normal negative signal, not an error), so it
     * does not throw on the expected misses; genuine network failure still rejects.
     */
    async detectDiagnosticsApi(): Promise<"legacy" | "collection" | "none"> {
        if (await this.#probeOk("/api/diagnostics")) return "collection";
        if (await this.#probeOk("/diagnostics")) return "legacy";
        return "none";
    }

    /**
     * Status-only probe: whether `path` responds 2xx. Cancels the response body without buffering it
     * — capability detection needs only the status, and a real `/diagnostics` snapshot can be large.
     * A 404/other status is a normal negative signal (returns false); only a network failure rejects.
     */
    async #probeOk(path: string): Promise<boolean> {
        const url = `${this.#baseUrl}${path}`;
        const controller = new AbortController();
        const timer: Timer = Time.getTimer("otbr-probe-timeout", this.#timeout, () => controller.abort()).start();
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal: controller.signal,
            });
            await response.body?.cancel().catch(() => {});
            return response.ok;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `GET ${path} failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            timer.stop();
        }
    }

    async #postJson(path: string, body: unknown): Promise<unknown> {
        const url = `${this.#baseUrl}${path}`;
        const controller = new AbortController();
        const timer: Timer = Time.getTimer("otbr-post-json-timeout", this.#timeout, () => controller.abort()).start();
        try {
            const response = await fetch(url, {
                method: "POST",
                // The collection API mandates the JSON:API media type on both request and response.
                headers: { "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await response.text();
            if (!response.ok) {
                throw new OtbrRestError(
                    errorCodeForStatus(response.status),
                    `POST ${path} returned ${response.status}`,
                    {
                        httpStatus: response.status,
                    },
                );
            }
            try {
                return normalizeKeys(JSON.parse(text));
            } catch (err) {
                throw new OtbrRestError("rest_protocol", `POST ${path} returned non-JSON body`, {
                    cause: err instanceof Error ? err : undefined,
                });
            }
        } catch (err) {
            if (err instanceof OtbrRestError) throw err;
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `POST ${path} failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            timer.stop();
        }
    }

    async #postActions(body: Record<string, unknown>): Promise<void> {
        const url = `${this.#baseUrl}/api/actions`;
        const controller = new AbortController();
        const timer: Timer = Time.getTimer("otbr-post-actions-timeout", this.#timeout, () =>
            controller.abort(),
        ).start();
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
            timer.stop();
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
            return { status: response.status, body: null, keyFormat: null };
        }
        if (!response.ok) {
            throw new OtbrRestError(errorCodeForStatus(response.status), `GET ${path} returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(response.text);
        } catch (err) {
            throw new OtbrRestError("rest_protocol", `GET ${path} returned non-JSON body`, {
                cause: err instanceof Error ? err : undefined,
            });
        }
        const keyFormat = isRecord(parsed) ? detectKeyFormat(parsed) : null;
        return { status: response.status, body: normalizeKeys(parsed), keyFormat };
    }

    async #fetchText(path: string): Promise<string | undefined> {
        const response = await this.#doFetch(path, "text/plain");
        if (response.status === HTTP_NO_CONTENT) return undefined;
        if (!response.ok) {
            throw new OtbrRestError(errorCodeForStatus(response.status), `GET ${path} returned ${response.status}`, {
                httpStatus: response.status,
            });
        }
        return response.text;
    }

    async #doFetch(path: string, accept: string): Promise<{ status: number; ok: boolean; text: string }> {
        const url = `${this.#baseUrl}${path}`;
        const controller = new AbortController();
        const timer: Timer = Time.getTimer("otbr-fetch-timeout", this.#timeout, () => controller.abort()).start();
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { Accept: accept },
                signal: controller.signal,
            });
            // Read the body inside the timer's scope so the timeout covers a BR that
            // sends headers then stalls the body (RFC-silent, seen on flaky OTBR).
            const text = await response.text();
            return { status: response.status, ok: response.ok, text };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `GET ${path} failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            timer.stop();
        }
    }

    async #mutate(
        method: "PUT" | "POST" | "DELETE",
        path: string,
        opts?: { contentType?: string; body?: string },
    ): Promise<void> {
        const url = `${this.#baseUrl}${path}`;
        const controller = new AbortController();
        const timer: Timer = Time.getTimer("otbr-mutate-timeout", this.#timeout, () => controller.abort()).start();
        const headers: Record<string, string> = {};
        if (opts?.contentType !== undefined) headers["Content-Type"] = opts.contentType;
        let status: number;
        let ok: boolean;
        try {
            const response = await fetch(url, { method, headers, body: opts?.body, signal: controller.signal });
            // Drain the body inside the timer scope so the timeout covers a BR that
            // sends headers then stalls the body (mirrors #doFetch).
            await response.text();
            status = response.status;
            ok = response.ok;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OtbrRestError("rest_unreachable", `${method} ${path} failed: ${message}`, {
                cause: err instanceof Error ? err : undefined,
            });
        } finally {
            timer.stop();
        }
        if (!ok) {
            throw new OtbrRestError(errorCodeForStatus(status), `${method} ${path} returned ${status}`, {
                httpStatus: status,
            });
        }
    }
}
