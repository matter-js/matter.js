/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OtbrRestClient } from "../src/otbr-rest/OtbrRestClient.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures/otbr-rest");

const NODE_FIXTURE = readFileSync(resolve(FIXTURE_DIR, "node.json"), "utf8");
const DIAGNOSTICS_FIXTURE = readFileSync(resolve(FIXTURE_DIR, "diagnostics.json"), "utf8");
const DATASET_HEX_FIXTURE = readFileSync(resolve(FIXTURE_DIR, "dataset-active.hex"), "utf8").trim();

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function installFetch(handler: FetchHandler): () => void {
    const original = globalThis.fetch;
    const replacement: typeof fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return handler(url, init);
    };
    globalThis.fetch = replacement;
    return () => {
        globalThis.fetch = original;
    };
}

describe("OtbrRestClient", () => {
    it("getNode parses /node fixture into typed object with hex bytes", async () => {
        const restore = installFetch(async url => {
            expect(url).to.equal("http://br.example:8081/node");
            return new Response(NODE_FIXTURE, { status: 200, headers: { "Content-Type": "application/json" } });
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const node = await client.getNode();
            expect(node.networkName).to.equal("TestNet");
            expect(node.state).to.equal("router");
            expect(node.numOfRouter).to.equal(5);
            expect(node.rloc16).to.equal(29696);
            expect(Bytes.toHex(node.extPanId)).to.equal("1122334455667788");
            expect(Bytes.toHex(node.extAddress)).to.equal("0011223344556601");
            expect(Bytes.toHex(node.baId)).to.equal("00112233445566778899aabbccddeeff");
            expect(node.leaderData.partitionId).to.equal(305419896);
            expect(node.leaderData.leaderRouterId).to.equal(61);
        } finally {
            restore();
        }
    });

    it("getDiagnostics returns array of 5 entries with normalized keys", async () => {
        const restore = installFetch(async url => {
            expect(url).to.equal("http://br.example:8081/diagnostics");
            return new Response(DIAGNOSTICS_FIXTURE, { status: 200 });
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const list = await client.getDiagnostics();
            expect(list).to.have.length(5);
            const first = list[0];
            expect(first).to.be.an("object");
            if (first === null || typeof first !== "object") throw new Error("expected object");
            expect("extAddress" in first).to.equal(true);
            expect("ip6AddressList" in first).to.equal(true);
            expect("macCounters" in first).to.equal(true);
        } finally {
            restore();
        }
    });

    it("getDataset returns activeHex from text/plain endpoint", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node/dataset/active")) {
                return new Response(DATASET_HEX_FIXTURE, { status: 200 });
            }
            if (url.endsWith("/node/dataset/pending")) {
                return new Response(null, { status: 204 });
            }
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const dataset = await client.getDataset();
            expect(dataset.activeHex).to.equal(DATASET_HEX_FIXTURE);
            expect(dataset.pendingHex).to.be.undefined;
        } finally {
            restore();
        }
    });

    it("getDataset omits pendingHex when /node/dataset/pending returns 204", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node/dataset/active")) return new Response("AABB", { status: 200 });
            if (url.endsWith("/node/dataset/pending")) return new Response(null, { status: 204 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const dataset = await client.getDataset();
            expect(dataset.activeHex).to.equal("AABB");
            expect(dataset.pendingHex).to.be.undefined;
        } finally {
            restore();
        }
    });

    it("throws OtbrRestError(rest_unreachable) on network failure", async () => {
        const restore = installFetch(async () => {
            throw new TypeError("fetch failed");
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.getNode();
                expect.fail("expected OtbrRestError");
            } catch (err) {
                expect(err).to.be.instanceOf(OtbrRestError);
                if (!(err instanceof OtbrRestError)) throw err;
                expect(err.code).to.equal("rest_unreachable");
            }
        } finally {
            restore();
        }
    });

    it("throws OtbrRestError(rest_protocol) with httpStatus on non-2xx", async () => {
        const restore = installFetch(async () => new Response("nope", { status: 500 }));
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.getNode();
                expect.fail("expected OtbrRestError");
            } catch (err) {
                expect(err).to.be.instanceOf(OtbrRestError);
                if (!(err instanceof OtbrRestError)) throw err;
                expect(err.code).to.equal("rest_protocol");
                expect(err.httpStatus).to.equal(500);
            }
        } finally {
            restore();
        }
    });

    it("throws OtbrRestError(rest_unreachable) on AbortController timeout", async () => {
        const restore = installFetch(async (_url, init) => {
            return new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal ?? null;
                if (signal !== null) {
                    signal.addEventListener("abort", () => {
                        reject(new DOMException("aborted", "AbortError"));
                    });
                }
            });
        });
        try {
            const client = new OtbrRestClient({ host: "br.example", timeoutMs: 20 });
            try {
                await client.getNode();
                expect.fail("expected OtbrRestError");
            } catch (err) {
                expect(err).to.be.instanceOf(OtbrRestError);
                if (!(err instanceof OtbrRestError)) throw err;
                expect(err.code).to.equal("rest_unreachable");
            }
        } finally {
            restore();
        }
    });

    it("wraps IPv6 host in brackets when building base URL", async () => {
        let observedUrl = "";
        const restore = installFetch(async url => {
            observedUrl = url;
            return new Response(NODE_FIXTURE, { status: 200 });
        });
        try {
            const client = new OtbrRestClient({ host: "fd00::1" });
            await client.getNode();
            expect(observedUrl).to.equal("http://[fd00::1]:8081/node");
        } finally {
            restore();
        }
    });
});
