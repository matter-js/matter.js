/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { OtbrRestProbe } from "../src/otbr-rest/OtbrRestProbe.js";
import { data as nodeCamelJson } from "./fixtures/otbr-rest/node-camel.json.js";
import { data as nodeJson } from "./fixtures/otbr-rest/node.json.js";

const NODE_PASCAL_FIXTURE = JSON.stringify(nodeJson);
const NODE_CAMEL_FIXTURE = JSON.stringify(nodeCamelJson);

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

describe("OtbrRestProbe", () => {
    before(MockTime.enable);

    it("detects keyFormat=pascal and diagnosticsApi=legacy for an old build", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response(NODE_PASCAL_FIXTURE, { status: 200 });
            if (url.endsWith("/api/diagnostics")) return new Response("", { status: 404 });
            if (url.endsWith("/diagnostics")) return new Response("[]", { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.not.be.null;
            if (cap === null) return;
            expect(cap.keyFormat).to.equal("pascal");
            expect(cap.diagnosticsApi).to.equal("legacy");
            expect(cap.networkName).to.equal("TestNet");
            expect(Bytes.toHex(cap.extPanId)).to.equal("1122334455667788");
            expect(cap.baseUrl).to.equal("http://br.example:8081");
            expect(cap.probedAt).to.be.greaterThan(0);
        } finally {
            restore();
        }
    });

    it("detects keyFormat=camel and diagnosticsApi=collection for a post-2024 build", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response(NODE_CAMEL_FIXTURE, { status: 200 });
            if (url.endsWith("/api/diagnostics")) return new Response("[]", { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.not.be.null;
            if (cap === null) return;
            expect(cap.keyFormat).to.equal("camel");
            expect(cap.diagnosticsApi).to.equal("collection");
            expect(cap.networkName).to.equal("MockThread");
            expect(Bytes.toHex(cap.extPanId)).to.equal("1122334455667799");
        } finally {
            restore();
        }
    });

    it("reports diagnosticsApi=none when neither diagnostics endpoint is served", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response(NODE_CAMEL_FIXTURE, { status: 200 });
            if (url.endsWith("/diagnostics")) return new Response("", { status: 404 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.not.be.null;
            expect(cap?.diagnosticsApi).to.equal("none");
        } finally {
            restore();
        }
    });

    it("never fetches /api/actions during probe", async () => {
        const seen = new Array<string>();
        const restore = installFetch(async url => {
            seen.push(url);
            if (url.endsWith("/node")) return new Response(NODE_CAMEL_FIXTURE, { status: 200 });
            if (url.endsWith("/api/diagnostics")) return new Response("[]", { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(seen.some(u => u.includes("/api/actions"))).to.be.false;
            expect(seen).to.deep.equal(["http://br.example:8081/node", "http://br.example:8081/api/diagnostics"]);
        } finally {
            restore();
        }
    });

    it("returns null when /node network errors", async () => {
        const restore = installFetch(async () => {
            throw new TypeError("fetch failed");
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });

    it("returns null when /node returns garbage shape", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response("not even json", { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });

    it("returns null when /node 200 but missing networkName/extPanId", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response(JSON.stringify({ foo: 1 }), { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });

    it("returns null when /node returns an empty object", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response("{}", { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });

    it("returns null when /node returns a non-OTBR error status", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/node")) return new Response("err", { status: 500 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });

    it("returns null when timeout exceeded", async () => {
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
            const probePromise = OtbrRestProbe.probe("br.example", 8081, 20);
            await MockTime.advance(20);
            const cap = await probePromise;
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });
});
