/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    TlvArray,
    TlvBitmap,
    TlvBoolean,
    TlvByteString,
    TlvCaseAuthenticatedTag,
    TlvFabricId,
    TlvField,
    TlvNodeId,
    TlvObject,
    TlvObjectWithMaxSize,
    TlvOptionalField,
    TlvOptionalRepeatedField,
    TlvString,
    TlvTaggedList,
    TlvUInt16,
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
    TypeFromSchema,
} from "#types";
import { ExtensionKeyUsageBitmap } from "./base.js";

/**
 * Matter specific Certificate Sizes
 * @see {@link MatterSpecification.v13.Core} 6.1.3.
 */
export const MAX_TLV_CERTIFICATE_SIZE = 400;

export const TlvCertificateExtension = TlvTaggedList({
    basicConstraints: TlvField(
        1,
        TlvObject({
            isCa: TlvField(1, TlvBoolean),
            pathLen: TlvOptionalField(2, TlvUInt8),
        }),
    ),
    keyUsage: TlvField(2, TlvBitmap(TlvUInt16, ExtensionKeyUsageBitmap)),
    extendedKeyUsage: TlvOptionalField(3, TlvArray(TlvUInt8)),
    subjectKeyIdentifier: TlvField(4, TlvByteString.bound({ length: 20 })),
    authorityKeyIdentifier: TlvField(5, TlvByteString.bound({ length: 20 })),
    futureExtension: TlvOptionalRepeatedField(6, TlvByteString),
});

export type CertificateExtension = TypeFromSchema<typeof TlvCertificateExtension>;

/** Definitions for Matter Operational Certificates (RCAC, ICAC, NOC) */
export namespace OperationalCertificate {
    /** All defined Matter fields for subject and issuer that we always allow optionally to be encoded */
    const AllowedSubjectAndIssuerMatterFields = {
        nodeId: TlvOptionalField(17, TlvNodeId),
        firmwareSigningId: TlvOptionalField(18, TlvUInt32),
        icacId: TlvOptionalField(19, TlvUInt64),
        rcacId: TlvOptionalField(20, TlvUInt64),
        fabricId: TlvOptionalField(21, TlvFabricId),
        caseAuthenticatedTags: TlvOptionalRepeatedField(22, TlvCaseAuthenticatedTag, { maxLength: 3 }),
    };

    /**
     * TLV schema for a generic subject or issuer field in a certificate. We handle all fields as optional here for the TLV
     * parsing and check required fields in the logic to make sure we return the correct errors.
     */
    const TlvGenericMatterSubjectOrIssuerTaggedList = <T>(matterFields: T) => {
        const fields = {
            // Standard DNs
            commonName: TlvOptionalField(1, TlvString),
            surName: TlvOptionalField(2, TlvString),
            serialNum: TlvOptionalField(3, TlvString),
            countryName: TlvOptionalField(4, TlvString),
            localityName: TlvOptionalField(5, TlvString),
            stateOrProvinceName: TlvOptionalField(6, TlvString),
            orgName: TlvOptionalField(7, TlvString),
            orgUnitName: TlvOptionalField(8, TlvString),
            title: TlvOptionalField(9, TlvString),
            name: TlvOptionalField(10, TlvString),
            givenName: TlvOptionalField(11, TlvString),
            initials: TlvOptionalField(12, TlvString),
            genQualifier: TlvOptionalField(13, TlvString),
            dnQualifier: TlvOptionalField(14, TlvString),
            pseudonym: TlvOptionalField(15, TlvString),
            domainComponent: TlvOptionalField(16, TlvString),

            // Matter specific DNs
            ...matterFields,

            // Standard DNs when encoded as Printable String
            commonNamePs: TlvOptionalField(129, TlvString),
            surNamePs: TlvOptionalField(130, TlvString),
            serialNumPs: TlvOptionalField(131, TlvString),
            countryNamePs: TlvOptionalField(132, TlvString),
            localityNamePs: TlvOptionalField(133, TlvString),
            stateOrProvinceNamePs: TlvOptionalField(134, TlvString),
            orgNamePs: TlvOptionalField(135, TlvString),
            orgUnitNamePs: TlvOptionalField(136, TlvString),
            titlePs: TlvOptionalField(137, TlvString),
            namePs: TlvOptionalField(138, TlvString),
            givenNamePs: TlvOptionalField(139, TlvString),
            initialsPs: TlvOptionalField(140, TlvString),
            genQualifierPs: TlvOptionalField(141, TlvString),
            dnQualifierPs: TlvOptionalField(142, TlvString),
            pseudonymPs: TlvOptionalField(143, TlvString),
        };
        return TlvTaggedList(fields);
    };

    /**
     * This generator enhances the generic Matter Certificate definition by allowing to override the subject and issuer
     * fields. The overriding serves two needs:
     * 1. to make some fields mandatory for the Tlv parsing and definition for the typescript types
     * 2. have typing guidance when generating certificates ourself in code
     *
     * On Tlv definition level also all not specified allowed Matter Fields are optionally allowed and are decoded,
     * re-encoded into Tlv and also encoded into ASN if the certificate is converted. Just the typing system do not know
     * about them.
     */
    const BaseMatterCertificate = <S, I>(matterFields?: { subject?: S; issuer?: I }) =>
        TlvObjectWithMaxSize(
            {
                serialNumber: TlvField(1, TlvByteString.bound({ maxLength: 20 })),
                signatureAlgorithm: TlvField(2, TlvUInt8),
                issuer: TlvField(
                    3,
                    TlvGenericMatterSubjectOrIssuerTaggedList<I>({
                        ...AllowedSubjectAndIssuerMatterFields,
                        ...(matterFields?.issuer ?? {}),
                    } as I),
                ),
                notBefore: TlvField(4, TlvUInt32),
                notAfter: TlvField(5, TlvUInt32),
                subject: TlvField(
                    6,
                    TlvGenericMatterSubjectOrIssuerTaggedList<S>({
                        ...AllowedSubjectAndIssuerMatterFields,
                        ...(matterFields?.subject ?? {}),
                    } as S),
                ),
                publicKeyAlgorithm: TlvField(7, TlvUInt8),
                ellipticCurveIdentifier: TlvField(8, TlvUInt8),
                ellipticCurvePublicKey: TlvField(9, TlvByteString),
                extensions: TlvField(10, TlvCertificateExtension),
                signature: TlvField(11, TlvByteString),
            },
            MAX_TLV_CERTIFICATE_SIZE,
        );

    export const TlvRcac = BaseMatterCertificate({
        subject: {
            rcacId: TlvField(20, TlvUInt64),
            fabricId: TlvOptionalField(21, TlvFabricId),
        },
        issuer: AllowedSubjectAndIssuerMatterFields,
    });

    export const TlvNoc = BaseMatterCertificate({
        subject: {
            nodeId: TlvField(17, TlvNodeId),
            fabricId: TlvField(21, TlvFabricId),
            caseAuthenticatedTags: TlvOptionalRepeatedField(22, TlvCaseAuthenticatedTag, { maxLength: 3 }),
        },
        issuer: AllowedSubjectAndIssuerMatterFields,
    });

    export const TlvIcac = BaseMatterCertificate({
        subject: {
            icacId: TlvField(19, TlvUInt64),
            fabricId: TlvOptionalField(21, TlvFabricId),
        },
        issuer: AllowedSubjectAndIssuerMatterFields,
    });

    export const TlvVvsc = BaseMatterCertificate({
        subject: {
            vvsId: TlvField(23, TlvUInt64),
        },
        issuer: AllowedSubjectAndIssuerMatterFields,
    });

    export type Rcac = TypeFromSchema<typeof TlvRcac>;
    export type Icac = TypeFromSchema<typeof TlvIcac>;
    export type Noc = TypeFromSchema<typeof TlvNoc>;
    export type Vvsc = TypeFromSchema<typeof TlvVvsc>;
}
