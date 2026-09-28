/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, Crypto, EcdsaSignature, MlDsa, PublicKey, X962 } from "@matter/general";

/** An ML-DSA signature over a certificate, as carried in its signatureValue BIT STRING. */
export class MlDsaSignature {
    readonly parameterSet: MlDsa.ParameterSet;
    readonly bytes: Bytes;

    constructor(parameterSet: MlDsa.ParameterSet, bytes: Bytes) {
        MlDsa.assertSignature(parameterSet, bytes);
        this.parameterSet = parameterSet;
        this.bytes = bytes;
    }
}

/** The issuer's signature over a certificate: ecdsa-with-SHA256, or ML-DSA for PQC Phase 1 attestation certificates. */
export type CertificateSignature = EcdsaSignature | MlDsaSignature;

/**
 * A certificate's public key, tagged by algorithm.
 *
 * An issuer's key algorithm fixes the signature algorithm of the certificates it signs: "ECDSA-P256" signs with
 * ecdsa-with-SHA256 and an ML-DSA key with the same parameter set (Matter Core §13.2.3).
 */
export type CertificateKeyAlgorithm = CertificatePublicKey["algorithm"];

/**
 * Whether a PAI with the given key algorithm may be issued by a PAA with the given one: the PAI may use a weaker
 * algorithm than its PAA but not a stronger one.
 *
 * @see Matter Core §13.2.5.1 (PQC Phase 1)
 */
export function mayIssue(paa: CertificateKeyAlgorithm, pai: CertificateKeyAlgorithm) {
    return STRENGTH[pai] <= STRENGTH[paa];
}

const STRENGTH: Record<CertificateKeyAlgorithm, number> = {
    "ECDSA-P256": 0,
    "ML-DSA-44": 1,
    "ML-DSA-65": 2,
};
export type CertificatePublicKey =
    | { readonly algorithm: "ECDSA-P256"; readonly key: PublicKey }
    | { readonly algorithm: MlDsa.ParameterSet; readonly key: Bytes };

/**
 * The signature carried by a certificate or CRL, from its signatureAlgorithm OID and signatureValue BIT STRING
 * content.
 *
 * @throws CertificateError if the algorithm is neither ecdsa-with-SHA256 nor ML-DSA-44/65, or the value is malformed
 * @see {@link https://www.rfc-editor.org/rfc/rfc9881 RFC 9881} for the ML-DSA signature encoding
 */
export function certificateSignatureOf(algorithmOid: Bytes, value: Bytes): CertificateSignature {
    const parameterSet = MlDsa.parameterSetForOid(algorithmOid);
    try {
        if (parameterSet !== undefined) {
            return new MlDsaSignature(parameterSet, value);
        }
        if (Bytes.areEqual(algorithmOid, X962.EcdsaWithSHA256._objectId._bytes)) {
            return new EcdsaSignature(value, "der");
        }
    } catch (cause) {
        throw new CertificateError("Malformed signature value", { cause });
    }
    throw new CertificateError(
        `Signature algorithm ${Bytes.toHex(algorithmOid)} is neither ecdsa-with-SHA256 nor ML-DSA`,
    );
}

/**
 * Verify a signature over DER data with the signer's key.
 *
 * @throws CertificateError if the key algorithm cannot have produced the signature
 * @throws CryptoVerifyError if the signature does not verify
 * @throws KeyInputError if the key is malformed
 * @see Matter Core §10.12.3 (PQC Phase 1) for ML-DSA
 */
export async function verifyCertificateSignature(
    crypto: Crypto,
    signerKey: CertificatePublicKey,
    data: Bytes,
    signature: CertificateSignature,
) {
    if (signature instanceof MlDsaSignature) {
        if (signerKey.algorithm !== signature.parameterSet) {
            throw new CertificateError(
                `Signature is ${signature.parameterSet} but the signer key is ${signerKey.algorithm}`,
            );
        }
        return crypto.verifyMlDsa(signature.parameterSet, signerKey.key, data, signature.bytes);
    }

    if (signerKey.algorithm !== "ECDSA-P256") {
        throw new CertificateError(`Signature is ecdsa-with-SHA256 but the signer key is ${signerKey.algorithm}`);
    }
    return crypto.verifyEcdsa(signerKey.key, data, signature);
}
