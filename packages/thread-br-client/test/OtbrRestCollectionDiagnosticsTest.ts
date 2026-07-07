/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Millis } from "@matter/general";
import type { DiagnosticResponse } from "../src/diagnostic/DiagnosticResponse.js";
import type { OtbrRestCapability } from "../src/otbr-rest/OtbrRestCapability.js";
import { OtbrRestClient } from "../src/otbr-rest/OtbrRestClient.js";
import { OtbrRestDiagnosticSource } from "../src/otbr-rest/OtbrRestDiagnosticSource.js";

const EXT_PAN_HEX = "1122334455667799";

/**
 * Stateful fetch-level mock of the post-2024 OTBR collection REST API. Models the real
 * request→poll→result flow: `POST /api/actions` creates an action that completes on the next poll;
 * a completed `getNetworkDiagnosticTask` appends a diagnostic entry for its destination, and
 * `updateDeviceCollectionTask` publishes the device directory. Drives the real
 * {@link OtbrRestClient} + orchestration over HTTP.
 */
class MockCollectionOtbr {
    #restore?: () => void;
    #actions = new Map<string, { type: string; destination?: string; polls: number; done: boolean }>();
    #diagnostics: Array<Record<string, unknown>> = [];
    #seq = 0;
    #diagAttempts = new Map<string, number>();
    clearCount = 0;
    discoverCount = 0;
    // extAddress -> the diagnostic entry a getNetworkDiagnosticTask for it yields. Missing = "stopped".
    readonly nodes: Map<string, Record<string, unknown>>;
    // Destinations that stop on their first attempt and only succeed on a retry.
    readonly flakyFirst: Set<string>;

    constructor(nodes: Map<string, Record<string, unknown>>, flakyFirst: Set<string> = new Set()) {
        this.nodes = nodes;
        this.flakyFirst = flakyFirst;
    }

    install(): void {
        const original = globalThis.fetch;
        this.#restore = () => {
            globalThis.fetch = original;
        };
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const method = (init?.method ?? "GET").toUpperCase();
            const path = new URL(url).pathname;
            return this.#route(method, path, typeof init?.body === "string" ? init.body : undefined);
        }) as typeof fetch;
    }
    uninstall(): void {
        this.#restore?.();
    }

    #json(body: unknown, status = 200): Response {
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/vnd.api+json" },
        });
    }

    #route(method: string, path: string, body?: string): Response {
        if (method === "POST" && path === "/api/actions") {
            const parsed = JSON.parse(body ?? "{}");
            const item = parsed.data?.[0];
            const id = `act-${this.#seq++}`;
            const destination = item?.attributes?.destination;
            if (item?.type === "updateDeviceCollectionTask") this.discoverCount++;
            if (item?.type === "getNetworkDiagnosticTask" && typeof destination === "string") {
                this.#diagAttempts.set(destination, (this.#diagAttempts.get(destination) ?? 0) + 1);
            }
            this.#actions.set(id, { type: item?.type, destination, polls: 0, done: false });
            return this.#json({ data: [{ id, type: item?.type, attributes: { status: "pending" } }] });
        }
        if (method === "GET" && path.startsWith("/api/actions/")) {
            const id = path.slice("/api/actions/".length);
            const action = this.#actions.get(id);
            if (action === undefined) return this.#json({ title: "Not Found", status: 404 }, 404);
            action.polls++;
            if (!action.done && action.polls >= 1) {
                action.done = true;
                if (action.type === "getNetworkDiagnosticTask" && action.destination !== undefined) {
                    const entry = this.nodes.get(action.destination);
                    const stopsThisAttempt =
                        this.flakyFirst.has(action.destination) &&
                        (this.#diagAttempts.get(action.destination) ?? 0) <= 1;
                    if (entry !== undefined && !stopsThisAttempt) this.#diagnostics.push(entry);
                    else {
                        return this.#json({ data: { id, attributes: { status: "stopped" } } });
                    }
                }
            }
            return this.#json({ data: { id, attributes: { status: action.done ? "completed" : "pending" } } });
        }
        if (method === "GET" && path === "/api/devices") {
            const devices = [...this.nodes.keys()].map(extAddress => ({ extAddress }));
            return new Response(JSON.stringify(devices), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (method === "GET" && path === "/api/diagnostics") {
            return new Response(JSON.stringify(this.#diagnostics), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (method === "DELETE" && path === "/api/diagnostics") {
            this.clearCount++;
            this.#diagnostics = [];
            return new Response("", { status: 200 });
        }
        return new Response(`no route ${method} ${path}`, { status: 501 });
    }
}

function capability(): OtbrRestCapability {
    return {
        baseUrl: "http://br.example:8081",
        keyFormat: "camel",
        probedAt: 0,
        networkName: "MockThread",
        extPanId: Bytes.of(Bytes.fromHex(EXT_PAN_HEX)),
        diagnosticsApi: "collection",
    };
}

function diagNode(extAddress: string, rloc16: string): Record<string, unknown> {
    return { extAddress, rloc16 };
}

async function collectAll(source: OtbrRestDiagnosticSource): Promise<DiagnosticResponse[]> {
    const nodes: DiagnosticResponse[] = [];
    const handle = source.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 0 });
    handle.onNode.on(n => {
        nodes.push(n);
    });
    await handle.done;
    return nodes;
}

describe("OtbrRestDiagnosticSource collection API", () => {
    before(MockTime.enable);

    let mock: MockCollectionOtbr;
    afterEach(() => mock?.uninstall());

    function makeSource(
        nodes: Map<string, Record<string, unknown>>,
        flakyFirst: Set<string> = new Set(),
    ): OtbrRestDiagnosticSource {
        mock = new MockCollectionOtbr(nodes, flakyFirst);
        mock.install();
        const client = new OtbrRestClient({ host: "br.example" });
        return new OtbrRestDiagnosticSource(client, capability(), {
            pollInterval: Millis(1),
            actionTimeout: Millis(1000),
            discoverTimeout: Millis(1000),
            retries: 2,
        });
    }

    it("discovers, per-node queries, and aggregates all mesh nodes", async () => {
        const nodes = new Map([
            ["12ac0f37d73aa693", diagNode("12ac0f37d73aa693", "0x4800")],
            ["dae92dad730ecfd2", diagNode("dae92dad730ecfd2", "0xe000")],
        ]);
        const source = makeSource(nodes);
        const drive = collectAll(source);
        for (let i = 0; i < 12; i++) {
            await MockTime.yield();
            await MockTime.advance(1);
        }
        const result = await drive;
        const rlocs = result.map(n => n.rloc16).sort();
        expect(rlocs).to.deep.equal([0x4800, 0xe000]);
    });

    it("skips nodes whose diagnostic action stops without a result", async () => {
        const nodes = new Map([
            ["12ac0f37d73aa693", diagNode("12ac0f37d73aa693", "0x4800")],
            // present in the device directory but yields no diagnostic (action stops)
            ["deadbeefdeadbeef", undefined as unknown as Record<string, unknown>],
        ]);
        const source = makeSource(nodes);
        const drive = collectAll(source);
        for (let i = 0; i < 12; i++) {
            await MockTime.yield();
            await MockTime.advance(1);
        }
        const result = await drive;
        expect(result.map(n => n.rloc16)).to.deep.equal([0x4800]);
    });

    it("retries a node that stops on its first attempt and collects it on retry", async () => {
        const nodes = new Map([["12ac0f37d73aa693", diagNode("12ac0f37d73aa693", "0x4800")]]);
        const source = makeSource(nodes, new Set(["12ac0f37d73aa693"]));
        const drive = collectAll(source);
        for (let i = 0; i < 20; i++) {
            await MockTime.yield();
            await MockTime.advance(1);
        }
        const result = await drive;
        expect(result.map(n => n.rloc16)).to.deep.equal([0x4800]);
    });

    async function driveAndCollect(source: OtbrRestDiagnosticSource): Promise<DiagnosticResponse[]> {
        const drive = collectAll(source);
        for (let i = 0; i < 16; i++) {
            await MockTime.yield();
            await MockTime.advance(1);
        }
        return drive;
    }

    it("dedupes two BRs reporting the same rloc16 to a single node", async () => {
        const nodes = new Map([
            ["aaaaaaaaaaaaaaaa", diagNode("aaaaaaaaaaaaaaaa", "0x4800")],
            ["bbbbbbbbbbbbbbbb", diagNode("bbbbbbbbbbbbbbbb", "0x4800")],
        ]);
        const result = await driveAndCollect(makeSource(nodes));
        expect(result).to.have.length(1);
        expect(result[0].rloc16).to.equal(0x4800);
    });

    it("keeps entries that carry no rloc16 (not collapsed as duplicates)", async () => {
        const nodes = new Map([
            ["aaaaaaaaaaaaaaaa", { extAddress: "aaaaaaaaaaaaaaaa" }],
            ["bbbbbbbbbbbbbbbb", { extAddress: "bbbbbbbbbbbbbbbb" }],
        ]);
        const result = await driveAndCollect(makeSource(nodes));
        expect(result).to.have.length(2);
        expect(result.every(n => n.rloc16 === undefined)).to.equal(true);
    });

    it("keeps a node with a malformed ipv6 address, dropping only that field", async () => {
        const nodes = new Map([
            [
                "12ac0f37d73aa693",
                { extAddress: "12ac0f37d73aa693", rloc16: "0x4800", ipv6Addresses: ["fe80::1%wpan0"] },
            ],
        ]);
        const result = await driveAndCollect(makeSource(nodes));
        expect(result).to.have.length(1);
        expect(result[0].rloc16).to.equal(0x4800);
        expect(result[0].ipv6Addresses).to.be.undefined;
    });

    it("keeps a node with a malformed extAddress, dropping only that field", async () => {
        const nodes = new Map([
            // 14 hex chars — wrong length for an 8-byte ext address.
            ["12ac0f37d73aa693", { extAddress: "12ac0f37d73aa6", rloc16: "0x4800" }],
        ]);
        const result = await driveAndCollect(makeSource(nodes));
        expect(result).to.have.length(1);
        expect(result[0].rloc16).to.equal(0x4800);
        expect(result[0].extMacAddress).to.be.undefined;
    });

    it("coalesces concurrent sweeps into a single BR-mutating collection run", async () => {
        const nodes = new Map([["12ac0f37d73aa693", diagNode("12ac0f37d73aa693", "0x4800")]]);
        const source = makeSource(nodes);
        // Two overlapping multicast sweeps on the same source instance.
        const a: DiagnosticResponse[] = [];
        const b: DiagnosticResponse[] = [];
        const ha = source.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 0 });
        const hb = source.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 0 });
        ha.onNode.on(n => {
            a.push(n);
        });
        hb.onNode.on(n => {
            b.push(n);
        });
        for (let i = 0; i < 16; i++) {
            await MockTime.yield();
            await MockTime.advance(1);
        }
        await Promise.all([ha.done, hb.done]);
        expect(mock.clearCount).to.equal(1);
        expect(mock.discoverCount).to.equal(1);
        expect(a.map(n => n.rloc16)).to.deep.equal([0x4800]);
        expect(b.map(n => n.rloc16)).to.deep.equal([0x4800]);
    });
});
