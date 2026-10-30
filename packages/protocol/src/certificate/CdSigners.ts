/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, Crypto, EcdsaSignature, InternalError, PublicKey } from "@matter/general";
import { Certificate } from "./kinds/Certificate.js";
import { CertificationDeclaration } from "./kinds/CertificationDeclaration.js";

/** Subject key identifier of the CSA "Matter Certification and Testing CA", the root every CD signing key chains to. */
const CSA_CD_ROOT_SKID = Bytes.fromHex("97E469D0C50414C26FC701F77E947739098DF6A5");

/** Public key of the CSA "Matter Certification and Testing CA". */
const CSA_CD_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "04384a3ac3aa5dbecb720fe6211d3cad48626ff711a0a4929fadd860f8e277ffc0de1f3eb6337a34847b5a3a056ea8710e9377eeedee251703fdd9350125cb8e48",
);

/** CSA "Certification Declaration Signing Key 001" to "005", by subject key identifier, as CHIP ships them built in. */
const CSA_CD_SIGNING_KEYS = new Map(
    [
        [
            "FE343F959947763B61EE4539131338494FE67D8E",
            "04cdeee93e44f8b72be3d1a9c07e21968b9afff3b403f05e1669d7b1e5caee6fc7714b42e7e23695e92cd7635473a280ae688f37bb9489e11629b9b94ff7b09929",
        ],
        [
            "DD04DB585B214C1C581587E6568DF487B6DDC701",
            "04031937e8f94251045df27457bb46253ee3754e8c12ae28557d8027b9d4c356d91b408cff32275017b25f8c8ba20516d5c83af2b724128013dfcc8f95d200a90b",
        ],
        [
            "471035E7C04EAAA8BE7C4D4C13E3E4C20995A84B",
            "049f575cd5fdb7521f10a4df31f073912b614728f2d37f5b6b96bc2cbf7c0b119690577d555d21a09660a8b082a339ea530f7a812d8693b56fd764185fabcd32f5",
        ],
        [
            "F68603A3692E981072419EA1E1AB3854BD7795D3",
            "047cfc8d8810a89cf4fa191778f2afec78f8517a97a3e57fc213bad888e3611e74ffb684bdeba8a68b25234a5c358f373bab9b6d304e1306dd7620a528d1161c0b",
        ],
        [
            "637F2634AD62EAFE6AF662EFB96F6FD2FCBFFC2F",
            "04438a52c662a2a6d72647f95eb753136ee4ae0fdb3aa9c16931426b3d0867f9103ae7d7a1b887e9f813a6f26f76bbcda93593787c12778ca8f2975dc45a2042f9",
        ],
    ].map(([skid, publicKey]) => [skid, Bytes.fromHex(publicKey)]),
);

/** Validity of the CSA CD root, in Matter epoch seconds: 2022-07-07T19:28:04Z to 2122-06-13T19:28:04Z. */
const CSA_CD_ROOT_NOT_BEFORE = 710537284;
const CSA_CD_ROOT_NOT_AFTER = 3864137284;

/**
 * The keys that may sign a Certification Declaration, as CHIP trusts them.
 *
 * | Signer                                          | Known through                                  |
 * |-------------------------------------------------|------------------------------------------------|
 * | CSA CD signing keys 001 to 005                  | {@link known}, built in                        |
 * | The Matter test CD signer                       | {@link known}; the caller applies its policy   |
 * | A certificate the CSA CD root issued and signed | {@link verifyCertificate}, for a DCL answer    |
 *
 * No other key is a CD signer, in particular no PAA or PAI.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.3.1
 * @see {@link MatterSpecification.v161.Core} § 6.3.1
 */
export namespace CdSigners {
    /** A trusted CD signer. */
    export interface Signer {
        /** EC P-256 public key that verifies the CD signature. */
        publicKey: Bytes;

        /**
         * Marks the Matter test CD signer. It may sign only CDs of certification_type test or provisional, and only a
         * caller that accepts test certificates should trust it.
         */
        isTestSigner: boolean;
    }

    /** The built-in CSA signing key or the Matter test CD signer that `subjectKeyId` names, else `undefined`. */
    export function known(subjectKeyId: Bytes): Signer | undefined {
        if (isTestSigner(subjectKeyId)) {
            return { publicKey: CertificationDeclaration.testSignerInfo().publicKey, isTestSigner: true };
        }
        const publicKey = CSA_CD_SIGNING_KEYS.get(Bytes.toHex(subjectKeyId).toUpperCase());
        return publicKey === undefined ? undefined : { publicKey, isTestSigner: false };
    }

    /** Whether `subjectKeyId` names the Matter test CD signer ({@link CertificationDeclaration.testSignerInfo}). */
    export function isTestSigner(subjectKeyId: Bytes) {
        return Bytes.areEqual(subjectKeyId, CertificationDeclaration.testSignerInfo().subjectKeyId);
    }

    /**
     * Check that a DER certificate is a CD signer for `subjectKeyId`: its subject key identifier is `subjectKeyId`, the
     * CSA "Matter Certification and Testing CA" issued and signed it, and the root was valid when the certificate
     * became valid.
     *
     * The validity rule follows CHIP, which validates the chain at the certificate's notBefore time. CHIP's strict
     * X.509 profile checks of the chain are not repeated.
     *
     * @returns the certificate's EC P-256 public key
     * @throws CertificateError naming the rule the certificate breaks, or why it cannot be parsed
     */
    export async function verifyCertificate(crypto: Crypto, der: Bytes, subjectKeyId: Bytes): Promise<Bytes> {
        const cert = Certificate.parseAsn1Certificate(der, Certificate.REQUIRED_EXTENSIONS);
        const { subjectKeyIdentifier, authorityKeyIdentifier } = cert.extensions;
        if (!Bytes.areEqual(subjectKeyIdentifier, subjectKeyId)) {
            throw new CertificateError(
                `Certificate has subject key identifier ${Bytes.toHex(subjectKeyIdentifier)}, not ${Bytes.toHex(subjectKeyId)}`,
            );
        }
        if (Bytes.areEqual(subjectKeyIdentifier, CSA_CD_ROOT_SKID)) {
            throw new CertificateError("The CSA CD root certificate is not itself a CD signer");
        }
        if (!Bytes.areEqual(authorityKeyIdentifier, CSA_CD_ROOT_SKID)) {
            throw new CertificateError(
                `Certificate is issued by ${Bytes.toHex(authorityKeyIdentifier)}, not the CSA CD root ${Bytes.toHex(CSA_CD_ROOT_SKID)}`,
            );
        }
        if (cert.notBefore < CSA_CD_ROOT_NOT_BEFORE || cert.notBefore > CSA_CD_ROOT_NOT_AFTER) {
            throw new CertificateError("Certificate became valid outside the validity period of the CSA CD root");
        }
        if (cert.tbsDer === undefined) {
            throw new InternalError("A parsed certificate carries its TBSCertificate");
        }
        try {
            await crypto.verifyEcdsa(
                PublicKey(CSA_CD_ROOT_PUBLIC_KEY),
                cert.tbsDer,
                new EcdsaSignature(cert.signature),
            );
        } catch (cause) {
            throw new CertificateError("Certificate signature does not verify against the CSA CD root", { cause });
        }
        return cert.ellipticCurvePublicKey;
    }
}
