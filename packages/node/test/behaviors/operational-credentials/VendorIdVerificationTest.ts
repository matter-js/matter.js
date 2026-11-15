/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorIdVerification } from "#behaviors/operational-credentials";
import { Bytes, Crypto, MATTER_CRYPTO_PRIMITIVES_VERSION, StandardCrypto, Time } from "@matter/general";
import { CertificateAuthority, Vvsc } from "@matter/protocol";
import { FabricId, FabricIndex, NodeId, TlvAny, VendorId } from "@matter/types";

const NODE_ID_TAG = 17;
const RCAC_ID_TAG = 20;
const FABRIC_ID_TAG = 21;
const VVS_ID_TAG = 23;

/** Statement version, fabric binding message, signer SKID and signature, with content the VVSC check never reaches. */
const STATEMENT = Bytes.concat(Bytes.fromHex("21"), new Uint8Array(76 + 20 + 64));

function matterEpochSeconds(addYears: number) {
    const date = new Date(Time.now.getTime());
    date.setUTCFullYear(date.getUTCFullYear() + addYears);
    return Math.floor((date.getTime() - Date.UTC(2000, 0, 1)) / 1000);
}

type VvscKeyUsage = ConstructorParameters<typeof Vvsc>[0]["extensions"]["keyUsage"];

/** A signed VVSC of an unrelated key. */
async function vvscTlv(crypto: Crypto, keyUsage: VvscKeyUsage) {
    const key = await crypto.createKeyPair();
    const skid = Bytes.of(await crypto.computeHash(key.publicKey, "SHA-1"));
    const vvsc = new Vvsc({
        serialNumber: Bytes.fromHex("01"),
        signatureAlgorithm: 1,
        publicKeyAlgorithm: 1,
        ellipticCurveIdentifier: 1,
        notBefore: matterEpochSeconds(-1),
        notAfter: matterEpochSeconds(10),
        ellipticCurvePublicKey: key.publicKey,
        issuer: { rcacId: 1 },
        subject: { vvsId: 3 },
        extensions: {
            basicConstraints: { isCa: false },
            keyUsage,
            subjectKeyIdentifier: skid,
            authorityKeyIdentifier: skid,
        },
    });
    await vvsc.sign(crypto, key);
    return vvsc.asSignedTlv();
}

function withoutEntry(tlv: Bytes, tagId: number) {
    const stream = TlvAny.decode(tlv);
    return TlvAny.encode(stream.filter(({ tag }) => tag?.id !== tagId));
}

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
        async function verify(
            crypto: Crypto,
            mutate: {
                noc?: (noc: Bytes) => Bytes;
                rcac?: (rcac: Bytes) => Bytes;
                vvsc?: (vvsc: Bytes) => Bytes;
                vvscKeyUsage?: VvscKeyUsage;
            },
        ) {
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
                fabric: {
                    rootPublicKey: nocKey.publicKey,
                    fabricId: FabricId(1),
                    rootVendorId: VendorId(0xfff1),
                    vidVerificationStatement: mutate.vvsc || mutate.vvscKeyUsage ? STATEMENT : undefined,
                },
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
                noc: {
                    noc: mutate.noc?.(noc) ?? noc,
                    icac: null,
                    vvsc: mutate.vvsc
                        ? mutate.vvsc(await vvscTlv(crypto, { digitalSignature: true }))
                        : mutate.vvscKeyUsage && (await vvscTlv(crypto, mutate.vvscKeyUsage)),
                    fabricIndex,
                },
                rcac: mutate.rcac?.(authority.rootCert) ?? authority.rootCert,
                fabric: {
                    rootPublicKey: nocKey.publicKey,
                    vendorId: VendorId(0xfff1),
                    fabricId: FabricId(1),
                    nodeId: NodeId(0x1234n),
                    label: "",
                    vidVerificationStatement: mutate.vvsc || mutate.vvscKeyUsage ? STATEMENT : undefined,
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

        it("returns false for a NOC that lacks a required subject attribute", async () => {
            const noc = (tlv: Bytes) => withoutEntry(tlv, FABRIC_ID_TAG);
            expect(await verify(new StandardCrypto(), { noc })).false;
        });

        it("returns false for a VVSC that repeats a subject attribute", async () => {
            const vvsc = (tlv: Bytes) => withRepeatedEntry(tlv, VVS_ID_TAG);
            expect(await verify(new StandardCrypto(), { vvsc })).false;
        });

        it("returns false for a VVSC that fails its certificate profile", async () => {
            const vvscKeyUsage = { digitalSignature: true, keyEncipherment: true };
            expect(await verify(new StandardCrypto(), { vvscKeyUsage })).false;
        });

        it("returns false for an RCAC that repeats a subject attribute", async () => {
            const rcac = (tlv: Bytes) => withRepeatedEntry(tlv, RCAC_ID_TAG);
            expect(await verify(new StandardCrypto(), { rcac })).false;
        });
    });
});
