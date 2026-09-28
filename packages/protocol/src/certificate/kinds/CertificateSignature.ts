/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, EcdsaSignature, MlDsa, PublicKey } from "@matter/general";

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
