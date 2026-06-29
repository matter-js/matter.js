/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkDiagTlvType, NetworkDiagTlvTypeName } from "../src/tlv/networkDiagTlvTypes.js";

describe("NetworkDiagTlvType", () => {
    it("exposes the canonical numeric values", () => {
        expect(NetworkDiagTlvType.EXT_MAC_ADDRESS).to.equal(0);
        expect(NetworkDiagTlvType.ADDRESS16).to.equal(1);
        expect(NetworkDiagTlvType.MODE).to.equal(2);
        expect(NetworkDiagTlvType.TIMEOUT).to.equal(3);
        expect(NetworkDiagTlvType.CONNECTIVITY).to.equal(4);
        expect(NetworkDiagTlvType.ROUTE64).to.equal(5);
        expect(NetworkDiagTlvType.LEADER_DATA).to.equal(6);
        expect(NetworkDiagTlvType.NETWORK_DATA).to.equal(7);
        expect(NetworkDiagTlvType.IPV6_ADDRESS_LIST).to.equal(8);
        expect(NetworkDiagTlvType.MAC_COUNTERS).to.equal(9);
        expect(NetworkDiagTlvType.BATTERY_LEVEL).to.equal(14);
        expect(NetworkDiagTlvType.SUPPLY_VOLTAGE).to.equal(15);
        expect(NetworkDiagTlvType.CHILD_TABLE).to.equal(16);
        expect(NetworkDiagTlvType.CHANNEL_PAGES).to.equal(17);
        expect(NetworkDiagTlvType.TYPE_LIST).to.equal(18);
        expect(NetworkDiagTlvType.MAX_CHILD_TIMEOUT).to.equal(19);
        expect(NetworkDiagTlvType.EUI64).to.equal(23);
        expect(NetworkDiagTlvType.VERSION).to.equal(24);
        expect(NetworkDiagTlvType.VENDOR_NAME).to.equal(25);
        expect(NetworkDiagTlvType.VENDOR_MODEL).to.equal(26);
        expect(NetworkDiagTlvType.VENDOR_SW_VERSION).to.equal(27);
        expect(NetworkDiagTlvType.THREAD_STACK_VERSION).to.equal(28);
        expect(NetworkDiagTlvType.MLE_COUNTERS).to.equal(34);
    });

    it("includes Thread 1.4 forward-compat numeric stubs", () => {
        expect(NetworkDiagTlvType.NON_PREFERRED_CHANNELS).to.equal(36);
        expect(NetworkDiagTlvType.ENHANCED_ROUTE).to.equal(37);
        expect(NetworkDiagTlvType.BR_STATE).to.equal(38);
        expect(NetworkDiagTlvType.BR_FAVORED_ON_LINK_PREFIX).to.equal(43);
    });

    it("has no duplicate numeric values", () => {
        const values = Object.values(NetworkDiagTlvType);
        expect(new Set(values).size).to.equal(values.length);
    });

    it("contains the expected number of registered entries", () => {
        expect(Object.keys(NetworkDiagTlvType)).to.have.lengthOf(37);
    });
});

describe("NetworkDiagTlvTypeName", () => {
    it("maps numeric type back to canonical name", () => {
        expect(NetworkDiagTlvTypeName[0]).to.equal("EXT_MAC_ADDRESS");
        expect(NetworkDiagTlvTypeName[5]).to.equal("ROUTE64");
        expect(NetworkDiagTlvTypeName[18]).to.equal("TYPE_LIST");
        expect(NetworkDiagTlvTypeName[24]).to.equal("VERSION");
        expect(NetworkDiagTlvTypeName[25]).to.equal("VENDOR_NAME");
        expect(NetworkDiagTlvTypeName[34]).to.equal("MLE_COUNTERS");
    });

    it("returns undefined for an unknown type", () => {
        expect(NetworkDiagTlvTypeName[200]).to.equal(undefined);
    });
});
