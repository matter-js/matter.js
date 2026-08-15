/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { normalizeKeys } from "../src/otbr-rest/caseNormalizer.js";
import type { OtbrRestCapability } from "../src/otbr-rest/OtbrRestCapability.js";
import type { OtbrNodeInfo, OtbrRestClient } from "../src/otbr-rest/OtbrRestClient.js";
import { OtbrRestDiagnosticSource } from "../src/otbr-rest/OtbrRestDiagnosticSource.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";
import { data as diagnosticsJson } from "./fixtures/otbr-rest/diagnostics.json.js";

const RAW_DIAGNOSTICS: unknown = diagnosticsJson;

type ClientLike = Pick<
    OtbrRestClient,
    | "getDiagnostics"
    | "getNode"
    | "resetDiagnosticCounters"
    | "postAction"
    | "getAction"
    | "getDiagnosticsCollection"
    | "listDevices"
    | "clearDiagnostics"
>;

function normalizedDiagnostics(): unknown[] {
    const normalized = normalizeKeys(RAW_DIAGNOSTICS);
    if (!Array.isArray(normalized)) throw new Error("expected array");
    return normalized;
}

function makeCapability(extPanIdHex: string): OtbrRestCapability {
    return {
        baseUrl: "http://br.example:8081",
        keyFormat: "camel",
        probedAt: 1_700_000_000_000,
        networkName: "TestNet",
        extPanId: Bytes.of(Bytes.fromHex(extPanIdHex)),
        diagnosticsApi: "legacy",
    };
}

function mockClient(): ClientLike {
    return {
        getDiagnostics: async () => normalizedDiagnostics(),
        getNode: async (): Promise<OtbrNodeInfo> => {
            throw new Error("not used in tests");
        },
        resetDiagnosticCounters: async () => {},
        postAction: async () => {
            throw new Error("not used in legacy tests");
        },
        getAction: async () => {
            throw new Error("not used in legacy tests");
        },
        getDiagnosticsCollection: async () => {
            throw new Error("not used in legacy tests");
        },
        listDevices: async () => {
            throw new Error("not used in legacy tests");
        },
        clearDiagnostics: async () => {},
    };
}

describe("OtbrRestDiagnosticSource", () => {
    it("kind is 'otbr-rest'", () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        expect(source.kind).to.equal("otbr-rest");
    });

    it("canQuery returns true for matching extPanId", () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        expect(source.canQuery(Bytes.of(Bytes.fromHex("1122334455667788")))).to.equal(true);
    });

    it("canQuery returns false for non-matching extPanId", () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        expect(source.canQuery(Bytes.of(Bytes.fromHex("AABBCCDDEEFF0011")))).to.equal(false);
    });

    it("queryUnicast({rloc16}) returns single DiagnosticResponse for matching node", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        const response = await source.queryUnicast({ rloc16: 18432 }, []);
        expect(response.rloc16).to.equal(18432);
        expect(response.extMacAddress).to.not.be.undefined;
        expect(Bytes.toHex(response.extMacAddress!)).to.equal("0011223344556602");
    });

    it("queryUnicast({rloc16}) returns leader entry from fixture", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        const response = await source.queryUnicast({ rloc16: 29696 }, []);
        expect(response.rloc16).to.equal(29696);
    });

    it("queryUnicast throws OtbrRestError when rloc16 not found", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        try {
            await source.queryUnicast({ rloc16: 0xffff }, []);
            expect.fail("expected OtbrRestError");
        } catch (err) {
            expect(err).to.be.instanceOf(OtbrRestError);
        }
    });

    it("queryUnicast({ip}) without rloc16 throws", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        try {
            await source.queryUnicast({ ip: "fd00::1" }, []);
            expect.fail("expected error");
        } catch (err) {
            expect(err).to.be.instanceOf(OtbrRestError);
            if (!(err instanceof OtbrRestError)) throw err;
            expect(err.message).to.include("ip-routed");
        }
    });

    it("queryUnicast() without rloc16 or ip throws", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        try {
            await source.queryUnicast({}, []);
            expect.fail("expected error");
        } catch (err) {
            expect(err).to.be.instanceOf(OtbrRestError);
        }
    });

    it("queryMulticast streams 5 DiagnosticResponse entries (one per fixture node) and resolves done", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        const handle = source.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 100 });
        const responses = new Array<Awaited<ReturnType<typeof source.queryUnicast>>>();
        handle.onNode.on(r => {
            responses.push(r);
        });
        await handle.done;
        expect(responses).to.have.length(5);
        for (const r of responses) {
            expect(r.rloc16).to.be.a("number");
            expect(r.extMacAddress).to.be.instanceOf(Uint8Array);
        }
    });

    it("queryMulticast ignores scope/windowMs/tlvTypes (no-ops in REST)", async () => {
        const source = new OtbrRestDiagnosticSource(mockClient(), makeCapability("1122334455667788"));
        const collect = async (
            scope: "ff03::1" | "ff03::2",
            tlvTypes: number[],
            windowMs: number,
        ): Promise<unknown[]> => {
            const h = source.queryMulticast(scope, { tlvTypes, windowMs });
            const out = new Array<unknown>();
            h.onNode.on(r => {
                out.push(r);
            });
            await h.done;
            return out;
        };
        const a = await collect("ff03::1", [1, 2, 3], 0);
        const b = await collect("ff03::2", [], 5000);
        expect(a).to.have.length(b.length);
    });

    it('rejects diagnostics when diagnosticsApi is "none" instead of hitting a 404', async () => {
        const cap = { ...makeCapability("1122334455667788"), diagnosticsApi: "none" as const };
        let getDiagnosticsCalled = false;
        const client: ClientLike = {
            ...mockClient(),
            getDiagnostics: async () => {
                getDiagnosticsCalled = true;
                return [];
            },
        };
        const source = new OtbrRestDiagnosticSource(client, cap);
        try {
            await source.queryUnicast({ rloc16: 18432 }, []);
            expect.fail("expected OtbrRestError");
        } catch (err) {
            expect(err).to.be.instanceOf(OtbrRestError);
            expect((err as OtbrRestError).code).to.equal("rest_unsupported");
        }
        expect(getDiagnosticsCalled).to.equal(false);
    });
});
