/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshCopTlvType, MeshCopTlvTypeName } from "../src/dataset/meshcopTlvTypes.js";

describe("MeshCopTlvType", () => {
    it("exposes the canonical numeric values", () => {
        expect(MeshCopTlvType.CHANNEL).to.equal(0);
        expect(MeshCopTlvType.PANID).to.equal(1);
        expect(MeshCopTlvType.EXTPANID).to.equal(2);
        expect(MeshCopTlvType.NETWORK_NAME).to.equal(3);
        expect(MeshCopTlvType.PSKC).to.equal(4);
        expect(MeshCopTlvType.NETWORK_KEY).to.equal(5);
        expect(MeshCopTlvType.MESH_LOCAL_PREFIX).to.equal(7);
        expect(MeshCopTlvType.SECURITY_POLICY).to.equal(12);
        expect(MeshCopTlvType.ACTIVE_TIMESTAMP).to.equal(14);
        expect(MeshCopTlvType.PENDING_TIMESTAMP).to.equal(51);
        expect(MeshCopTlvType.DELAY_TIMER).to.equal(52);
        expect(MeshCopTlvType.CHANNEL_MASK).to.equal(53);
        expect(MeshCopTlvType.JOINER_ADVERTISEMENT).to.equal(241);
    });

    it("has no duplicate numeric values", () => {
        const values = Object.values(MeshCopTlvType);
        expect(new Set(values).size).to.equal(values.length);
    });

    it("contains the 43 entries known to Agners' reference parser", () => {
        expect(Object.keys(MeshCopTlvType)).to.have.lengthOf(43);
    });

    it("includes the post-spec extensions DURATION, THREAD_DOMAIN_NAME, WAKEUP_CHANNEL", () => {
        expect(MeshCopTlvType.DURATION).to.equal(23);
        expect(MeshCopTlvType.THREAD_DOMAIN_NAME).to.equal(59);
        expect(MeshCopTlvType.WAKEUP_CHANNEL).to.equal(74);
    });
});

describe("MeshCopTlvTypeName", () => {
    it("maps numeric type back to canonical name", () => {
        expect(MeshCopTlvTypeName[0]).to.equal("CHANNEL");
        expect(MeshCopTlvTypeName[3]).to.equal("NETWORK_NAME");
        expect(MeshCopTlvTypeName[12]).to.equal("SECURITY_POLICY");
        expect(MeshCopTlvTypeName[241]).to.equal("JOINER_ADVERTISEMENT");
    });

    it("returns undefined for an unknown type", () => {
        expect(MeshCopTlvTypeName[200]).to.equal(undefined);
    });
});
