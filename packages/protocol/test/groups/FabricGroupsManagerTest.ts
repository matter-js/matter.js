/**
 * @license
 * Copyright 2022-2023 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { Bytes, Key, PrivateKey, StandardCrypto } from "#general";
import { FabricId, FabricIndex, GlobalFabricId, GroupId, NodeId, VendorId } from "#types";

const TEST_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
);
const TEST_IDENTITY_PROTECTION_KEY = Bytes.fromHex("9bc61cd9c62a2df6d64dfcaa9dc472d4");
const SEC1_KEY = Bytes.fromHex(
    "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
);

describe("FabricGroupsManager", () => {
    describe("Group IPv6 address calculation", () => {
        it("should calculate group IPv6 address", async () => {
            const fabric = new Fabric(new StandardCrypto(), {
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
                operationalIdentityProtectionKey: TEST_IDENTITY_PROTECTION_KEY,
                intermediateCACert: new Uint8Array(),
                operationalCert: new Uint8Array(),
                label: "",
            });

            expect(fabric.groups.multicastAddressFor(GroupId(0x1234))).equals("ff35:40:fd45:6789:abcd:ef12:3400:1234");
        });
    });
});
