/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorIdVerification } from "#behaviors/operational-credentials";
import { Bytes, MockCrypto, PrivateKey, PublicKey } from "#general";
import { FabricId, FabricIndex, VendorId } from "#types";

describe("VendorIdVerification", () => {
    const crypto = MockCrypto();

    it("Validate the Flow", async () => {
        // prepare Test data
        const fabricIndex = FabricIndex(5);
        const clientChallenge = Bytes.fromHex("a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0");
        const attChallenge = Bytes.fromHex("904b82e66e985785b4a3ff18c25947f3");

        // Fabric data
        const fabricId = FabricId(BigInt("0x1122334455667788"));
        const rootVendorId = VendorId(0xfff1);
        const rootPublicKey = Bytes.fromHex(
            "04d59f3eb0b9c216a46f040affdfd55817ca8a3dc921aa624da5168ba90766d73bf08e480cd0f5cc94653a92d77719d9b004747d5f7da39dedb67ec54f7cbc6ade",
        );

        // Step 1: Prepare Data to Sign, this is basically what signVidVerificationRequest is doing
        const { signatureData } = VendorIdVerification.dataToSign({
            fabricIndex,
            clientChallenge,
            attChallenge,
            fabric: {
                fabricId,
                rootPublicKey,
                rootVendorId,
                vidVerificationStatement: undefined,
            },
        });
        const nocPrivateKey = Bytes.fromHex("65656fbe5731c20cc6807a86c1b8baf42faba88953d2f66a44b08a670a654e3f");
        // Signature which is returned by
        const signature = await crypto.signEcdsa(PrivateKey(nocPrivateKey), signatureData);

        crypto.verifyEcdsa(PublicKey(rootPublicKey), signatureData, Bytes.of(signature));

        // TODO implement this part when we have a Certificate ASN to TLV converter
        // details see Core Spec 1208++
        /*
        const result = await VendorIdVerification.verifyData(crypto, {
            clientChallenge,
            attChallenge,
            signVerificationResponse: { fabricIndex, signature, fabricBindingVersion},
            fabricIndex,
            noc: {
                noc: Bytes;
                icac?: Bytes;
                vvsc?: Bytes;
            };
            rcac: Bytes;
            fabric: {
                vendorId: VendorId;
                vidVerificationStatement?: Bytes;
            };
        });
        */
    });
});
