/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Observable } from "@matter/main";
import type { ThreadCredentialsRegistry } from "../src/credentials/ThreadCredentialsRegistry.js";
import type { ThreadNetworkCredentials } from "../src/credentials/ThreadNetworkCredentials.js";
import type { DiagnosticResponse } from "../src/diagnostic/DiagnosticResponse.js";
import type { DiagnosticSource, QueryMulticastHandle } from "../src/diagnostic/DiagnosticSource.js";
import type { BorderRouterEntry } from "../src/discovery/BorderRouterEntry.js";
import type { OtbrRestCapability } from "../src/otbr-rest/OtbrRestCapability.js";
import { selectSource } from "../src/selection/selectSource.js";

const EXT_PAN_BYTES = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
const EXT_PAN_HEX_LOWER = Bytes.toHex(EXT_PAN_BYTES);
// BorderRouterEntry.extendedPanIdHex is documented as 16-char uppercase.
const EXT_PAN_HEX_UPPER = EXT_PAN_HEX_LOWER.toUpperCase();

function makeBr(overrides: Partial<BorderRouterEntry> = {}): BorderRouterEntry {
    return {
        extAddressHex: "AAAAAAAAAAAAAAAA",
        extendedPanIdHex: EXT_PAN_HEX_UPPER,
        addresses: [],
        sources: ["meshcop"],
        lastSeen: 0,
        ...overrides,
    };
}

function makeCreds(): ThreadNetworkCredentials {
    return {
        extPanId: EXT_PAN_BYTES.slice(),
        networkName: "OpenThread",
        pskc: new Uint8Array(16),
        activeTimestamp: 0n,
    };
}

function makeCap(): OtbrRestCapability {
    return {
        baseUrl: "http://example.test",
        keyFormat: "camel",
        probedAt: 0,
        networkName: "OpenThread",
        extPanId: EXT_PAN_BYTES.slice(),
    };
}

type CredentialsLike = Pick<ThreadCredentialsRegistry, "getCredentials">;

function credsRegistryWith(creds: ThreadNetworkCredentials | undefined): CredentialsLike {
    return {
        getCredentials: () => creds,
    };
}

function emptyHandle(): QueryMulticastHandle {
    return {
        onNode: new Observable<[DiagnosticResponse]>(),
        onError: new Observable<[Error]>(),
        done: Promise.resolve(),
        close: async () => {},
    };
}

const STUB_REST: DiagnosticSource = {
    kind: "otbr-rest",
    canQuery: () => true,
    queryUnicast: async (): Promise<DiagnosticResponse> => ({ unknown: [] }),
    queryMulticast: () => emptyHandle(),
    resetCounters: async () => {},
};

const STUB_MESHCOP: DiagnosticSource = {
    kind: "meshcop",
    canQuery: () => true,
    queryUnicast: async (): Promise<DiagnosticResponse> => ({ unknown: [] }),
    queryMulticast: () => emptyHandle(),
    resetCounters: async () => {},
};

describe("selectSource", () => {
    it("picks REST when otbrRestEnabled and a capability exists, even if creds are also registered", () => {
        const br = makeBr();
        const cap = makeCap();
        const restCalls = new Array<OtbrRestCapability>();
        const meshcopCalls = new Array<{ creds: ThreadNetworkCredentials; br: BorderRouterEntry }>();

        const result = selectSource({
            br,
            credentials: credsRegistryWith(makeCreds()),
            restCapabilities: new Map([[EXT_PAN_HEX_LOWER, cap]]),
            otbrRestEnabled: true,
            makeRestSource: c => {
                restCalls.push(c);
                return STUB_REST;
            },
            makeMeshcopSource: (creds, b) => {
                meshcopCalls.push({ creds, br: b });
                return STUB_MESHCOP;
            },
        });

        expect(result).to.equal(STUB_REST);
        expect(restCalls).to.have.lengthOf(1);
        expect(restCalls[0]).to.equal(cap);
        expect(meshcopCalls).to.have.lengthOf(0);
    });

    it("falls back to MeshCoP when REST is enabled but no capability is registered", () => {
        const br = makeBr();
        const creds = makeCreds();
        const meshcopCalls = new Array<{ creds: ThreadNetworkCredentials; br: BorderRouterEntry }>();

        const result = selectSource({
            br,
            credentials: credsRegistryWith(creds),
            restCapabilities: new Map(),
            otbrRestEnabled: true,
            makeRestSource: () => STUB_REST,
            makeMeshcopSource: (c, b) => {
                meshcopCalls.push({ creds: c, br: b });
                return STUB_MESHCOP;
            },
        });

        expect(result).to.equal(STUB_MESHCOP);
        expect(meshcopCalls).to.have.lengthOf(1);
        expect(meshcopCalls[0].creds).to.equal(creds);
        expect(meshcopCalls[0].br).to.equal(br);
    });

    it("uses MeshCoP when REST is disabled, even if a capability exists", () => {
        const br = makeBr();
        const cap = makeCap();
        const restCalls = new Array<OtbrRestCapability>();

        const result = selectSource({
            br,
            credentials: credsRegistryWith(makeCreds()),
            restCapabilities: new Map([[EXT_PAN_HEX_LOWER, cap]]),
            otbrRestEnabled: false,
            makeRestSource: c => {
                restCalls.push(c);
                return STUB_REST;
            },
            makeMeshcopSource: () => STUB_MESHCOP,
        });

        expect(result).to.equal(STUB_MESHCOP);
        expect(restCalls).to.have.lengthOf(0);
    });

    it("uses MeshCoP when REST is disabled and no capability exists", () => {
        const result = selectSource({
            br: makeBr(),
            credentials: credsRegistryWith(makeCreds()),
            restCapabilities: new Map(),
            otbrRestEnabled: false,
            makeRestSource: () => STUB_REST,
            makeMeshcopSource: () => STUB_MESHCOP,
        });

        expect(result).to.equal(STUB_MESHCOP);
    });

    it("returns undefined when REST is enabled, no capability, and no credentials", () => {
        const result = selectSource({
            br: makeBr(),
            credentials: credsRegistryWith(undefined),
            restCapabilities: new Map(),
            otbrRestEnabled: true,
            makeRestSource: () => STUB_REST,
            makeMeshcopSource: () => STUB_MESHCOP,
        });

        expect(result).to.equal(undefined);
    });

    it("returns undefined when REST is disabled and no credentials are registered", () => {
        const result = selectSource({
            br: makeBr(),
            credentials: credsRegistryWith(undefined),
            restCapabilities: new Map(),
            otbrRestEnabled: false,
            makeRestSource: () => STUB_REST,
            makeMeshcopSource: () => STUB_MESHCOP,
        });

        expect(result).to.equal(undefined);
    });

    it("returns undefined when the BR has no extendedPanIdHex (defensive)", () => {
        let restCalled = false;
        let meshcopCalled = false;

        const result = selectSource({
            br: makeBr({ extendedPanIdHex: undefined }),
            credentials: credsRegistryWith(makeCreds()),
            restCapabilities: new Map([[EXT_PAN_HEX_LOWER, makeCap()]]),
            otbrRestEnabled: true,
            makeRestSource: () => {
                restCalled = true;
                return STUB_REST;
            },
            makeMeshcopSource: () => {
                meshcopCalled = true;
                return STUB_MESHCOP;
            },
        });

        expect(result).to.equal(undefined);
        expect(restCalled).to.equal(false);
        expect(meshcopCalled).to.equal(false);
    });
});
