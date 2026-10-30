/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, MlDsa } from "@matter/general";
import { BitFlag, BitmapSchema, TypeFromPartialBitSchema } from "@matter/types";

export const ExtensionKeyUsageBitmap = {
    digitalSignature: BitFlag(0),
    nonRepudiation: BitFlag(1),
    keyEncipherment: BitFlag(2),
    dataEncipherment: BitFlag(3),
    keyAgreement: BitFlag(4),
    keyCertSign: BitFlag(5),
    cRLSign: BitFlag(6),
    encipherOnly: BitFlag(7),
    decipherOnly: BitFlag(8),
};
export const ExtensionKeyUsageSchema = BitmapSchema(ExtensionKeyUsageBitmap);

export interface MatterCertificate {
    serialNumber: Bytes;
    signatureAlgorithm: number;
    issuer: {};
    /** Raw DER bytes of the issuer Name, preserved for exact-match comparisons (e.g. CRL revocation lookup). Only present on parsed certificates. */
    issuerDer?: Bytes;
    /** Raw DER bytes of the subject Name, preserved for exact-match comparisons. Only present on parsed certificates. */
    subjectDer?: Bytes;
    /** Raw DER bytes of the TBSCertificate, preserved so signature verification matches the bytes that were actually signed. Only present on parsed certificates. */
    tbsDer?: Bytes;
    notBefore: number;
    notAfter: number;
    subject: {};
    publicKeyAlgorithm: number;
    ellipticCurveIdentifier: number;
    ellipticCurvePublicKey: Bytes;
    extensions: {
        basicConstraints: {
            isCa: boolean;
            pathLen?: number;
        };
        keyUsage: TypeFromPartialBitSchema<typeof ExtensionKeyUsageBitmap>;
        extendedKeyUsage?: number[];
        subjectKeyIdentifier: Bytes;
        authorityKeyIdentifier: Bytes;
        futureExtension?: Bytes[];
    };
    signature: Bytes;

    /**
     * The ML-DSA parameter set the issuer signed with, where it did not use ecdsa-with-SHA256.  Only attestation
     * certificates may carry one (PQC Phase 1).
     */
    mlDsaSignature?: MlDsa.ParameterSet;

    /**
     * The certificate's own ML-DSA public key, where it has one instead of an EC P-256 key; `ellipticCurvePublicKey`
     * is then empty.  Only PAA and PAI certificates may carry one (PQC Phase 1).
     */
    mlDsaPublicKey?: { parameterSet: MlDsa.ParameterSet; key: Bytes };

    /**
     * What the DER encoding states beyond the values in this object, for certificate profile checks.  Only present on
     * parsed certificates.
     */
    encoding?: MatterCertificate.Encoding;
}

export namespace MatterCertificate {
    export type ExtensionName = keyof MatterCertificate["extensions"];

    export interface Encoding {
        /** The X.509 `version` field; 2 means v3.  An absent field reads as 0 (v1), as does an explicit 0. */
        version: number;

        /**
         * Each interpreted extension the certificate carries, in encoding order and including duplicates.  An absent
         * extension has no entry, even where {@link MatterCertificate.extensions} holds a default for it.
         */
        extensions: { name: ExtensionName; critical: boolean }[];

        /**
         * All bits of the key usage BIT STRING, bit n as X.509 numbers it (0 is digitalSignature, 8 is decipherOnly),
         * so bits 9 and up that {@link MatterCertificate.extensions} cannot hold are kept too.  A set bit beyond bit
         * 15 reads as bit 16.  Undefined without the extension.
         */
        keyUsage?: number;
    }
}
