/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorIdVerification } from "#behaviors/operational-credentials";
import { Bytes, Crypto, MATTER_CRYPTO_PRIMITIVES_VERSION, StandardCrypto } from "@matter/general";
import { CertificateAuthority } from "@matter/protocol";
import { FabricId, FabricIndex, NodeId, TlvAny, VendorId } from "@matter/types";

const NODE_ID_TAG = 17;
const RCAC_ID_TAG = 20;

/** The first DN entry with {@link tagId} occurs twice. */
function withRepeatedEntry(tlv: Bytes, tagId: number) {
    const stream = TlvAny.decode(tlv);
    const index = stream.findIndex(({ tag }) => tag?.id === tagId);
    stream.splice(index + 1, 0, stream[index]);
    return TlvAny.encode(stream);
}

describe("VendorIdVerification", () => {
    describe("verifyData", () => {
        /** Verifies a NOC whose key signed the fabric binding, so the certificates are the first thing that fails. */
        async function verify(crypto: Crypto, mutate: { noc?: (noc: Bytes) => Bytes; rcac?: (rcac: Bytes) => Bytes }) {
            const authority = await CertificateAuthority.create(crypto, false);
            const nocKey = await crypto.createKeyPair();
            const noc = await authority.generateNoc(nocKey.publicKey, FabricId(1), NodeId(0x1234n));
            const clientChallenge = new Uint8Array(32);
            const attChallenge = new Uint8Array(16);
            const fabricIndex = FabricIndex(1);

            const { signatureData } = VendorIdVerification.dataToSign({
                clientChallenge,
                attChallenge,
                fabricIndex,
                fabric: { rootPublicKey: nocKey.publicKey, fabricId: FabricId(1), rootVendorId: VendorId(0xfff1) },
            });
            const { bytes: signature } = await crypto.signEcdsa(nocKey, signatureData);

            return VendorIdVerification.verifyData(crypto, {
                clientChallenge,
                attChallenge,
                signVerificationResponse: {
                    fabricIndex,
                    fabricBindingVersion: MATTER_CRYPTO_PRIMITIVES_VERSION,
                    signature,
                },
                noc: { noc: mutate.noc?.(noc) ?? noc, icac: null, fabricIndex },
                rcac: mutate.rcac?.(authority.rootCert) ?? authority.rootCert,
                fabric: {
                    rootPublicKey: nocKey.publicKey,
                    vendorId: VendorId(0xfff1),
                    fabricId: FabricId(1),
                    nodeId: NodeId(0x1234n),
                    label: "",
                    vidVerificationStatement: undefined,
                    fabricIndex,
                },
            });
        }

        it("returns true for a conformant chain", async () => {
            expect(await verify(new StandardCrypto(), {})).true;
        });

        it("returns false for a NOC that repeats a subject attribute", async () => {
            const noc = (tlv: Bytes) => withRepeatedEntry(tlv, NODE_ID_TAG);
            expect(await verify(new StandardCrypto(), { noc })).false;
        });

        it("returns false for an RCAC that repeats a subject attribute", async () => {
            const rcac = (tlv: Bytes) => withRepeatedEntry(tlv, RCAC_ID_TAG);
            expect(await verify(new StandardCrypto(), { rcac })).false;
        });
    });
});
