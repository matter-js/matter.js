/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { OperationalDataset } from "@matter/protocol";
import { OtbrRestClient } from "../src/otbr-rest/OtbrRestClient.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";
import { data as baIdJson } from "./fixtures/otbr-rest/ba-id.json.js";
import { data as datasetActiveHex } from "./fixtures/otbr-rest/dataset-active.hex.js";
import { data as diagnosticsJson } from "./fixtures/otbr-rest/diagnostics.json.js";
import { data as extAddressJson } from "./fixtures/otbr-rest/ext-address.json.js";
import { data as leaderDataJson } from "./fixtures/otbr-rest/leader-data.json.js";
import { data as networkNameJson } from "./fixtures/otbr-rest/network-name.json.js";
import { data as nodeCamelJson } from "./fixtures/otbr-rest/node-camel.json.js";
import { data as nodeJson } from "./fixtures/otbr-rest/node.json.js";
import { data as numOfRouterJson } from "./fixtures/otbr-rest/num-of-router.json.js";
import { data as rloc16Json } from "./fixtures/otbr-rest/rloc16.json.js";
import { data as stateJson } from "./fixtures/otbr-rest/state.json.js";

const NODE_FIXTURE = JSON.stringify(nodeJson);
const NODE_CAMEL_FIXTURE = JSON.stringify(nodeCamelJson);
const DIAGNOSTICS_FIXTURE = JSON.stringify(diagnosticsJson);

// A valid, decodable active-dataset TLV blob (synthetic network "MockThread") — no real network data.
const DATASET_HEX_FIXTURE = datasetActiveHex.trim();

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

interface RecordedRequest {
    method: string;
    path: string;
    body?: string;
    contentType?: string;
}

/**
 * Routes `(method, path)` to a canned {@link Response} over the {@link installFetch}
 * stub and records each request, so mutating-op tests can assert the exact verb,
 * path, body and content-type the client puts on the wire.
 */
class MockOtbrServer {
    readonly requests = new Array<RecordedRequest>();
    readonly #routes = new Map<string, () => Response>();
    #restore?: () => void;

    on(method: string, path: string, respond: () => Response): this {
        this.#routes.set(`${method} ${path}`, respond);
        return this;
    }

    install(): void {
        this.#restore = installFetch(async (url, init) => {
            const method = (init?.method ?? "GET").toUpperCase();
            const path = new URL(url).pathname;
            const headers = new Headers(init?.headers);
            this.requests.push({
                method,
                path,
                body: typeof init?.body === "string" ? init.body : undefined,
                contentType: headers.get("Content-Type") ?? undefined,
            });
            const route = this.#routes.get(`${method} ${path}`);
            if (route === undefined) {
                return new Response(`no route for ${method} ${path}`, { status: 501 });
            }
            return route();
        });
    }

    uninstall(): void {
        this.#restore?.();
    }

    lastRequest(): RecordedRequest {
        const last = this.requests[this.requests.length - 1];
        if (last === undefined) throw new Error("no request recorded");
        return last;
    }
}

function jsonResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

function textResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

async function expectRestError(promise: Promise<unknown>, code: string): Promise<void> {
    try {
        await promise;
        expect.fail(`expected OtbrRestError(${code})`);
    } catch (err) {
        expect(err).to.be.instanceOf(OtbrRestError);
        if (!(err instanceof OtbrRestError)) throw err;
        expect(err.code).to.equal(code);
    }
}

describe("OtbrRestClient", () => {
    before(MockTime.enable);

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

    it("getNode parses post-2024 camelCase /node payload (routerCount, hex-string rloc16)", async () => {
        const restore = installFetch(async url => {
            expect(url).to.equal("http://br.example:8081/node");
            return new Response(NODE_CAMEL_FIXTURE, { status: 200, headers: { "Content-Type": "application/json" } });
        });
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const node = await client.getNode();
            expect(node.networkName).to.equal("MockThread");
            expect(node.state).to.equal("router");
            expect(node.numOfRouter).to.equal(7);
            expect(node.rloc16).to.equal(0x4800);
            expect(Bytes.toHex(node.extPanId)).to.equal("1122334455667799");
            expect(Bytes.toHex(node.extAddress)).to.equal("0011223344556602");
            expect(Bytes.toHex(node.baId)).to.equal("0011223344556677889900aabbccddee");
            expect(node.leaderData.leaderRouterId).to.equal(5);
        } finally {
            restore();
        }
    });

    for (const bad of ["", "-5", "1e2", "0x10000", "99999", "0xzzzz", -1, 0x10000, 1.5] as const) {
        it(`getNode rejects out-of-range/malformed rloc16 ${JSON.stringify(bad)}`, async () => {
            const payload = JSON.parse(NODE_CAMEL_FIXTURE) as Record<string, unknown>;
            payload.rloc16 = bad;
            const restore = installFetch(async () => new Response(JSON.stringify(payload), { status: 200 }));
            try {
                const client = new OtbrRestClient({ host: "br.example" });
                await expectRestError(client.getNode(), "rest_protocol");
            } finally {
                restore();
            }
        });
    }

    it("getNode leaves numOfRouter undefined when neither numOfRouter nor routerCount present", async () => {
        const payload = JSON.parse(NODE_CAMEL_FIXTURE) as Record<string, unknown>;
        delete payload.routerCount;
        const restore = installFetch(async () => new Response(JSON.stringify(payload), { status: 200 }));
        try {
            const client = new OtbrRestClient({ host: "br.example" });
            const node = await client.getNode();
            expect(node.numOfRouter).to.be.undefined;
            expect(node.networkName).to.equal("MockThread");
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
            const getNodePromise = client.getNode();
            await MockTime.advance(20);
            try {
                await getNodePromise;
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

describe("OtbrRestClient read-only getters", () => {
    before(MockTime.enable);

    let server: MockOtbrServer;
    let client: OtbrRestClient;

    beforeEach(() => {
        server = new MockOtbrServer();
        server.install();
        client = new OtbrRestClient({ host: "br.example" });
    });

    afterEach(() => server.uninstall());

    it("getState returns the node role", async () => {
        server.on("GET", "/node/state", () => jsonResponse(JSON.stringify(stateJson)));
        expect(await client.getState()).to.equal("router");
    });

    it("getNetworkName returns the Thread network name", async () => {
        server.on("GET", "/node/network-name", () => jsonResponse(JSON.stringify(networkNameJson)));
        expect(await client.getNetworkName()).to.equal("TestNet");
    });

    it("getRloc returns the RLOC IPv6 address", async () => {
        server.on("GET", "/node/rloc", () => jsonResponse('"fd00:1122:3344:5566:0:ff:fe00:7400"'));
        expect(await client.getRloc()).to.equal("fd00:1122:3344:5566:0:ff:fe00:7400");
    });

    it("getRloc16 returns the 16-bit RLOC", async () => {
        server.on("GET", "/node/rloc16", () => jsonResponse(JSON.stringify(rloc16Json)));
        expect(await client.getRloc16()).to.equal(29696);
    });

    it("getNumOfRouter returns the router count", async () => {
        server.on("GET", "/node/num-of-router", () => jsonResponse(JSON.stringify(numOfRouterJson)));
        expect(await client.getNumOfRouter()).to.equal(5);
    });

    it("getExtAddress decodes the EUI-64 hex", async () => {
        server.on("GET", "/node/ext-address", () => jsonResponse(JSON.stringify(extAddressJson)));
        expect(Bytes.toHex(await client.getExtAddress())).to.equal("0011223344556601");
    });

    it("getExtPanId decodes the extended PAN ID hex", async () => {
        server.on("GET", "/node/ext-panid", () => jsonResponse('"1122334455667788"'));
        expect(Bytes.toHex(await client.getExtPanId())).to.equal("1122334455667788");
    });

    it("getBorderAgentId decodes the 16-byte BA ID hex", async () => {
        server.on("GET", "/node/ba-id", () => jsonResponse(JSON.stringify(baIdJson)));
        expect(Bytes.toHex(await client.getBorderAgentId())).to.equal("00112233445566778899aabbccddeeff");
    });

    it("getLeaderData returns the normalized leader record", async () => {
        server.on("GET", "/node/leader-data", () => jsonResponse(JSON.stringify(leaderDataJson)));
        const leader = await client.getLeaderData();
        expect(leader.partitionId).to.equal(305419896);
        expect(leader.weighting).to.equal(64);
        expect(leader.dataVersion).to.equal(147);
        expect(leader.stableDataVersion).to.equal(205);
        expect(leader.leaderRouterId).to.equal(61);
    });

    it("getActiveDataset decodes the text/plain hex into an OperationalDataset", async () => {
        server.on("GET", "/node/dataset/active", () => textResponse(DATASET_HEX_FIXTURE));
        const ds = await client.getActiveDataset();
        expect(ds).to.not.equal(undefined);
        expect(ds?.networkName).to.equal("MockThread");
    });

    it("getActiveDataset returns undefined on 204", async () => {
        server.on("GET", "/node/dataset/active", () => new Response(null, { status: 204 }));
        expect(await client.getActiveDataset()).to.equal(undefined);
    });

    it("getPendingDataset returns undefined on 204", async () => {
        server.on("GET", "/node/dataset/pending", () => new Response(null, { status: 204 }));
        expect(await client.getPendingDataset()).to.equal(undefined);
    });

    it("getActiveDataset returns undefined on an empty 200 body", async () => {
        server.on("GET", "/node/dataset/active", () => textResponse(""));
        expect(await client.getActiveDataset()).to.equal(undefined);
    });

    it("getActiveDataset throws rest_protocol on an undecodable 200 body", async () => {
        server.on("GET", "/node/dataset/active", () => textResponse("nothex!!"));
        await expectRestError(client.getActiveDataset(), "rest_protocol");
    });

    it("getCoprocessorVersion throws rest_unsupported on 404", async () => {
        server.on("GET", "/node/coprocessor/version", () => new Response("", { status: 404 }));
        await expectRestError(client.getCoprocessorVersion(), "rest_unsupported");
    });

    it("getCommissionerState throws rest_unsupported on 404", async () => {
        server.on("GET", "/node/commissioner/state", () => new Response("", { status: 404 }));
        await expectRestError(client.getCommissionerState(), "rest_unsupported");
    });

    it("getJoiners throws rest_unsupported on 404", async () => {
        server.on("GET", "/node/commissioner/joiner", () => new Response("", { status: 404 }));
        await expectRestError(client.getJoiners(), "rest_unsupported");
    });

    it("getJoiners returns the normalized joiner array", async () => {
        server.on("GET", "/node/commissioner/joiner", () =>
            jsonResponse('[{"Pskd":"J01NME","Eui64":"*","Timeout":120}]'),
        );
        const joiners = await client.getJoiners();
        expect(joiners).to.have.length(1);
        const first = joiners[0];
        if (first === null || typeof first !== "object") throw new Error("expected joiner object");
        expect("pskd" in first).to.equal(true);
    });

    it("getState throws rest_protocol when the body is not a string", async () => {
        server.on("GET", "/node/state", () => jsonResponse("123"));
        await expectRestError(client.getState(), "rest_protocol");
    });
});

describe("OtbrRestClient mutations", () => {
    before(MockTime.enable);

    let server: MockOtbrServer;
    let client: OtbrRestClient;

    beforeEach(() => {
        server = new MockOtbrServer();
        server.install();
        client = new OtbrRestClient({ host: "br.example" });
    });

    afterEach(() => server.uninstall());

    it('setState(true) PUTs "enable" as JSON', async () => {
        server.on("PUT", "/node/state", () => new Response("", { status: 200 }));
        await client.setState(true);
        const req = server.lastRequest();
        expect(req.method).to.equal("PUT");
        expect(req.path).to.equal("/node/state");
        expect(req.contentType).to.equal("application/json");
        expect(req.body).to.equal('"enable"');
    });

    it('setState(false) PUTs "disable"', async () => {
        server.on("PUT", "/node/state", () => new Response("", { status: 200 }));
        await client.setState(false);
        expect(server.lastRequest().body).to.equal('"disable"');
    });

    it("setActiveDataset(hex string) PUTs text/plain hex verbatim", async () => {
        server.on("PUT", "/node/dataset/active", () => new Response("", { status: 200 }));
        await client.setActiveDataset("AABBCC");
        const req = server.lastRequest();
        expect(req.method).to.equal("PUT");
        expect(req.path).to.equal("/node/dataset/active");
        expect(req.contentType).to.equal("text/plain");
        expect(req.body).to.equal("AABBCC");
    });

    it("setActiveDataset(OperationalDataset) PUTs the encoded TLV hex", async () => {
        server.on("PUT", "/node/dataset/active", () => new Response("", { status: 200 }));
        const ds = OperationalDataset.decode(DATASET_HEX_FIXTURE);
        await client.setActiveDataset(ds);
        const req = server.lastRequest();
        expect(req.contentType).to.equal("text/plain");
        expect((req.body ?? "").toUpperCase()).to.equal(DATASET_HEX_FIXTURE.toUpperCase());
    });

    it("setActiveDataset throws rest_conflict on 409", async () => {
        server.on("PUT", "/node/dataset/active", () => new Response("", { status: 409 }));
        await expectRestError(client.setActiveDataset("AABB"), "rest_conflict");
    });

    it("deleteActiveDataset DELETEs the endpoint with no body", async () => {
        server.on("DELETE", "/node/dataset/active", () => new Response(null, { status: 204 }));
        await client.deleteActiveDataset();
        const req = server.lastRequest();
        expect(req.method).to.equal("DELETE");
        expect(req.path).to.equal("/node/dataset/active");
        expect(req.body).to.equal(undefined);
    });

    it("setPendingDataset PUTs to the pending endpoint", async () => {
        server.on("PUT", "/node/dataset/pending", () => new Response("", { status: 200 }));
        await client.setPendingDataset("AABB");
        expect(server.lastRequest().path).to.equal("/node/dataset/pending");
    });

    it("deletePendingDataset DELETEs the pending endpoint", async () => {
        server.on("DELETE", "/node/dataset/pending", () => new Response(null, { status: 204 }));
        await client.deletePendingDataset();
        expect(server.lastRequest().method).to.equal("DELETE");
    });

    it("factoryReset DELETEs /node", async () => {
        server.on("DELETE", "/node", () => new Response(null, { status: 200 }));
        await client.factoryReset();
        const req = server.lastRequest();
        expect(req.method).to.equal("DELETE");
        expect(req.path).to.equal("/node");
    });

    it("factoryReset throws rest_not_allowed on 405", async () => {
        server.on("DELETE", "/node", () => new Response("", { status: 405 }));
        await expectRestError(client.factoryReset(), "rest_not_allowed");
    });

    it('setCommissionerState PUTs "disable" as JSON', async () => {
        server.on("PUT", "/node/commissioner/state", () => new Response("", { status: 200 }));
        await client.setCommissionerState(false);
        const req = server.lastRequest();
        expect(req.path).to.equal("/node/commissioner/state");
        expect(req.body).to.equal('"disable"');
    });

    it("addJoiner POSTs pskd/eui64/timeout as JSON", async () => {
        server.on("POST", "/node/commissioner/joiner", () => new Response("", { status: 200 }));
        await client.addJoiner({ pskd: "J01NME", eui64: "*", timeoutSeconds: 120 });
        const req = server.lastRequest();
        expect(req.method).to.equal("POST");
        expect(req.path).to.equal("/node/commissioner/joiner");
        expect(req.contentType).to.equal("application/json");
        expect(JSON.parse(req.body ?? "")).to.deep.equal({ pskd: "J01NME", eui64: "*", timeout: 120 });
    });

    it("addJoiner rejects when both eui64 and discerner are given", async () => {
        server.on("POST", "/node/commissioner/joiner", () => new Response("", { status: 200 }));
        let threw = false;
        try {
            await client.addJoiner({ pskd: "J01NME", eui64: "*", discerner: "0x123/12" });
        } catch (err) {
            threw = true;
            expect(err).to.be.instanceOf(Error);
        }
        expect(threw).to.equal(true);
        expect(server.requests).to.have.length(0);
    });

    it("removeJoiner DELETEs with the joiner id as a JSON string", async () => {
        server.on("DELETE", "/node/commissioner/joiner", () => new Response(null, { status: 200 }));
        await client.removeJoiner("*");
        const req = server.lastRequest();
        expect(req.method).to.equal("DELETE");
        expect(req.path).to.equal("/node/commissioner/joiner");
        expect(req.body).to.equal('"*"');
    });

    it("setState throws rest_conflict on 409", async () => {
        server.on("PUT", "/node/state", () => new Response("", { status: 409 }));
        await expectRestError(client.setState(true), "rest_conflict");
    });
});

describe("OtbrRestClient collection API", () => {
    before(MockTime.enable);

    let server: MockOtbrServer;
    let client: OtbrRestClient;

    beforeEach(() => {
        server = new MockOtbrServer();
        server.install();
        client = new OtbrRestClient({ host: "br.example" });
    });
    afterEach(() => server.uninstall());

    it("postAction posts a vnd.api+json task envelope and returns the action id", async () => {
        server.on("POST", "/api/actions", () =>
            jsonResponse(
                JSON.stringify({
                    data: [{ id: "act-123", type: "getNetworkDiagnosticTask", attributes: { status: "pending" } }],
                    meta: { collection: { offset: 0, limit: 200, total: 1 } },
                }),
            ),
        );
        const id = await client.postAction("getNetworkDiagnosticTask", {
            destination: "0011223344556677",
            types: ["extAddress", "rloc16"],
            timeout: 10,
        });
        expect(id).to.equal("act-123");
        const req = server.lastRequest();
        expect(req.method).to.equal("POST");
        expect(req.path).to.equal("/api/actions");
        expect(req.contentType).to.equal("application/vnd.api+json");
        expect(JSON.parse(req.body!)).to.deep.equal({
            data: [
                {
                    type: "getNetworkDiagnosticTask",
                    attributes: { destination: "0011223344556677", types: ["extAddress", "rloc16"], timeout: 10 },
                },
            ],
        });
    });

    it("postAction throws rest_protocol when the response carries no action id", async () => {
        server.on("POST", "/api/actions", () => jsonResponse(JSON.stringify({ data: [] })));
        await expectRestError(
            client.postAction("getNetworkDiagnosticTask", { destination: "0011223344556677", types: [] }),
            "rest_protocol",
        );
    });

    it("getAction returns the status and the completed result id", async () => {
        server.on("GET", "/api/actions/act-123", () =>
            jsonResponse(
                JSON.stringify({
                    data: {
                        id: "act-123",
                        type: "getNetworkDiagnosticTask",
                        attributes: { status: "completed" },
                        relationships: { result: { data: { type: "networkDiagnostics", id: "diag-9" } } },
                    },
                }),
            ),
        );
        const action = await client.getAction("act-123");
        expect(action.status).to.equal("completed");
        expect(action.resultId).to.equal("diag-9");
        expect(server.lastRequest().path).to.equal("/api/actions/act-123");
    });

    it("getAction returns status without a result id while pending", async () => {
        server.on("GET", "/api/actions/act-123", () =>
            jsonResponse(JSON.stringify({ data: { id: "act-123", attributes: { status: "pending" } } })),
        );
        const action = await client.getAction("act-123");
        expect(action.status).to.equal("pending");
        expect(action.resultId).to.be.undefined;
    });

    it("getDiagnosticsCollection requests application/json and returns the bare array", async () => {
        server.on("GET", "/api/diagnostics", () =>
            jsonResponse(JSON.stringify([{ rloc16: "0x4800" }, { rloc16: "0x0400" }])),
        );
        const list = await client.getDiagnosticsCollection();
        expect(list).to.have.length(2);
        expect(server.lastRequest().path).to.equal("/api/diagnostics");
    });

    it("getDiagnosticsCollection accepts a JSON:API envelope { data: [...] }", async () => {
        server.on("GET", "/api/diagnostics", () =>
            jsonResponse(JSON.stringify({ data: [{ rloc16: "0x4800" }], meta: { collection: { total: 1 } } })),
        );
        const list = await client.getDiagnosticsCollection();
        expect(list).to.have.length(1);
    });

    it("getDiagnosticsCollection throws rest_protocol when the body is neither array nor envelope", async () => {
        server.on("GET", "/api/diagnostics", () => jsonResponse(JSON.stringify({ foo: 1 })));
        await expectRestError(client.getDiagnosticsCollection(), "rest_protocol");
    });

    it("listDevices returns the bare device array", async () => {
        server.on("GET", "/api/devices", () =>
            jsonResponse(JSON.stringify([{ extAddress: "0011223344556677" }, { extAddress: "8899aabbccddeeff" }])),
        );
        const devices = await client.listDevices();
        expect(devices).to.have.length(2);
        expect(server.lastRequest().path).to.equal("/api/devices");
    });

    it("clearDiagnostics issues DELETE /api/diagnostics", async () => {
        server.on("DELETE", "/api/diagnostics", () => new Response("", { status: 200 }));
        await client.clearDiagnostics();
        const req = server.lastRequest();
        expect(req.method).to.equal("DELETE");
        expect(req.path).to.equal("/api/diagnostics");
    });
});

describe("OtbrRestClient.detectDiagnosticsApi", () => {
    before(MockTime.enable);

    let server: MockOtbrServer;
    let client: OtbrRestClient;

    beforeEach(() => {
        server = new MockOtbrServer();
        server.install();
        client = new OtbrRestClient({ host: "br.example" });
    });
    afterEach(() => server.uninstall());

    it('returns "collection" when GET /api/diagnostics is served', async () => {
        server.on("GET", "/api/diagnostics", () => jsonResponse("[]"));
        expect(await client.detectDiagnosticsApi()).to.equal("collection");
    });

    it('returns "legacy" when /api/diagnostics 404s but GET /diagnostics is served', async () => {
        server.on("GET", "/api/diagnostics", () => new Response("", { status: 404 }));
        server.on("GET", "/diagnostics", () => jsonResponse("[]"));
        expect(await client.detectDiagnosticsApi()).to.equal("legacy");
    });

    it('returns "none" when neither diagnostics endpoint is served', async () => {
        server.on("GET", "/api/diagnostics", () => new Response("", { status: 404 }));
        server.on("GET", "/diagnostics", () => new Response("", { status: 404 }));
        expect(await client.detectDiagnosticsApi()).to.equal("none");
    });
});
