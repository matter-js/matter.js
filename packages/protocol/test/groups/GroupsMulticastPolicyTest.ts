/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { Bytes, Key, PrivateKey, StandardCrypto } from "#general";
import { IANA_GROUPCAST_MULTICAST_ADDRESS } from "#groups/Groups.js";
import { FabricId, FabricIndex, GlobalFabricId, GroupId, NodeId, VendorId } from "#types";

const SEC1_KEY = Bytes.fromHex(
    "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
);
const TEST_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
);
const TEST_IPK = Bytes.fromHex("9bc61cd9c62a2df6d64dfcaa9dc472d4");

function makeFabric() {
    return new Fabric(new StandardCrypto(), {
        fabricIndex: FabricIndex(1),
        fabricId: FabricId(BigInt("0x456789ABCDEF1234")),
        nodeId: NodeId(1),
        rootNodeId: NodeId(1),
        globalId: GlobalFabricId(0),
        keyPair: Key({ sec1: SEC1_KEY }) as PrivateKey,
        rootPublicKey: TEST_ROOT_PUBLIC_KEY,
        rootVendorId: VendorId(0),
        rootCert: new Uint8Array(),
        identityProtectionKey: new Uint8Array(),
        operationalIdentityProtectionKey: TEST_IPK,
        intermediateCACert: new Uint8Array(),
        operationalCert: new Uint8Array(),
        label: "",
    });
}

describe("Groups multicast address policy (Groupcast, Matter 1.6)", () => {
    let fabric: Fabric;

    before(() => {
        fabric = makeFabric();
    });

    it("derives a per-group IPv6 address by default (PerGroupId policy)", () => {
        const addr = fabric.groups.multicastAddressFor(GroupId(0x1234));
        expect(addr).to.match(/^ff35:/i);
        expect(addr).not.equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
    });

    it("returns the shared IANA address when IanaAddr policy is set", () => {
        fabric.groups.setGroupMulticastPolicy(GroupId(0x0001), "ianaAddr");
        expect(fabric.groups.multicastAddressFor(GroupId(0x0001))).equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
    });

    it("reverts to per-group derivation after policy removal", () => {
        fabric.groups.setGroupMulticastPolicy(GroupId(0x0001), "ianaAddr");
        fabric.groups.removeGroupMulticastPolicy(GroupId(0x0001));
        const addr = fabric.groups.multicastAddressFor(GroupId(0x0001));
        expect(addr).to.match(/^ff35:/i);
        expect(addr).not.equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
    });

    it("different groups can have different policies independently", () => {
        fabric.groups.setGroupMulticastPolicy(GroupId(0x0001), "ianaAddr");
        fabric.groups.setGroupMulticastPolicy(GroupId(0x0002), "perGroupId");
        expect(fabric.groups.multicastAddressFor(GroupId(0x0001))).equal(IANA_GROUPCAST_MULTICAST_ADDRESS);
        expect(fabric.groups.multicastAddressFor(GroupId(0x0002))).to.match(/^ff35:/i);
        // Cleanup
        fabric.groups.removeGroupMulticastPolicy(GroupId(0x0001));
        fabric.groups.removeGroupMulticastPolicy(GroupId(0x0002));
    });
});
