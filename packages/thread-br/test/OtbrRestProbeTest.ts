/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OtbrRestProbe } from "../src/otbr-rest/OtbrRestProbe.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures/otbr-rest");
const NODE_FIXTURE = readFileSync(resolve(FIXTURE_DIR, "node.json"), "utf8");

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
    it("returns capability with keyFormat=camel when /api/actions returns 200", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/api/actions")) return new Response("[]", { status: 200 });
            if (url.endsWith("/node")) return new Response(NODE_FIXTURE, { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.not.be.null;
            if (cap === null) return;
            expect(cap.keyFormat).to.equal("camel");
            expect(cap.networkName).to.equal("TestNet");
            expect(Bytes.toHex(cap.extPanId)).to.equal("1122334455667788");
            expect(cap.baseUrl).to.equal("http://br.example:8081");
            expect(cap.probedAt).to.be.greaterThan(0);
        } finally {
            restore();
        }
    });

    it("returns capability with keyFormat=pascal when /api/actions returns 404", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/api/actions")) return new Response("not found", { status: 404 });
            if (url.endsWith("/node")) return new Response(NODE_FIXTURE, { status: 200 });
            throw new Error(`unexpected url: ${url}`);
        });
        try {
            const cap = await OtbrRestProbe.probe("br.example", 8081, 500);
            expect(cap).to.not.be.null;
            if (cap === null) return;
            expect(cap.keyFormat).to.equal("pascal");
        } finally {
            restore();
        }
    });

    it("returns null when /api/actions network errors", async () => {
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

    it("returns null when /node network errors", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/api/actions")) return new Response("[]", { status: 200 });
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
            if (url.endsWith("/api/actions")) return new Response("[]", { status: 200 });
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
            if (url.endsWith("/api/actions")) return new Response("[]", { status: 200 });
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

    it("returns null when /api/actions returns unexpected status (e.g. 500)", async () => {
        const restore = installFetch(async url => {
            if (url.endsWith("/api/actions")) return new Response("err", { status: 500 });
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
            const cap = await OtbrRestProbe.probe("br.example", 8081, 20);
            expect(cap).to.be.null;
        } finally {
            restore();
        }
    });
});
