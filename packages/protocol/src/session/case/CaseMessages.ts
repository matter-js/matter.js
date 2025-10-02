/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    Bytes,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    CRYPTO_GROUP_SIZE_BYTES,
    CRYPTO_HASH_LEN_BYTES,
    CRYPTO_PUBLIC_KEY_SIZE_BYTES,
} from "#general";
import { TlvByteString, TlvField, TlvObject, TlvOptionalField, TlvUInt16, TypeFromSchema } from "#types";
import { TlvSessionParameters, WithDurationSessionParameters } from "../pase/PaseMessages.js";

const CASE_SIGNATURE_LENGTH = CRYPTO_GROUP_SIZE_BYTES * 2;

export const KDFSR1_KEY_INFO = Bytes.fromString("Sigma1_Resume");
export const KDFSR2_KEY_INFO = Bytes.fromString("Sigma2_Resume");
export const RESUME1_MIC_NONCE = Bytes.fromString("NCASE_SigmaS1");
export const RESUME2_MIC_NONCE = Bytes.fromString("NCASE_SigmaS2");
export const KDFSR2_INFO = Bytes.fromString("Sigma2");
export const KDFSR3_INFO = Bytes.fromString("Sigma3");
export const TBE_DATA2_NONCE = Bytes.fromString("NCASE_Sigma2N");
export const TBE_DATA3_NONCE = Bytes.fromString("NCASE_Sigma3N");

/** @see {@link MatterSpecification.v13.Core} § 4.14.2.3 */
export const TlvCaseSigma1 = TlvObject({
    initiatorRandom: TlvField(1, TlvByteString.bound({ length: 32 })),
    initiatorSessionId: TlvField(2, TlvUInt16),
    destinationId: TlvField(3, TlvByteString.bound({ length: CRYPTO_HASH_LEN_BYTES })),
    initiatorEcdhPublicKey: TlvField(4, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })),
    initiatorSessionParams: TlvOptionalField(5, TlvSessionParameters),
    resumptionId: TlvOptionalField(6, TlvByteString.bound({ length: 16 })),
    initiatorResumeMic: TlvOptionalField(7, TlvByteString.bound({ length: CRYPTO_AEAD_MIC_LENGTH_BYTES })),
});
export type CaseSigma1 = WithDurationSessionParameters<TypeFromSchema<typeof TlvCaseSigma1>, "initiatorSessionParams">;

/** @see {@link MatterSpecification.v13.Core} § 4.14.2.3 */
export const TlvCaseSigma2 = TlvObject({
    responderRandom: TlvField(1, TlvByteString.bound({ length: 32 })),
    responderSessionId: TlvField(2, TlvUInt16),
    responderEcdhPublicKey: TlvField(3, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })),
    encrypted: TlvField(4, TlvByteString),
    responderSessionParams: TlvOptionalField(5, TlvSessionParameters),
});
export type CaseSigma2 = WithDurationSessionParameters<TypeFromSchema<typeof TlvCaseSigma2>, "responderSessionParams">;

/** @see {@link MatterSpecification.v13.Core} § 4.14.2.3 */
export const TlvCaseSigma2Resume = TlvObject({
    resumptionId: TlvField(1, TlvByteString.bound({ length: 16 })),
    resumeMic: TlvField(2, TlvByteString.bound({ length: 16 })),
    responderSessionId: TlvField(3, TlvUInt16),
    responderSessionParams: TlvOptionalField(4, TlvSessionParameters),
});
export type CaseSigma2Resume = WithDurationSessionParameters<
    TypeFromSchema<typeof TlvCaseSigma2Resume>,
    "responderSessionParams"
>;

/** @see {@link MatterSpecification.v13.Core} § 4.14.2.3 */
export const TlvCaseSigma3 = TlvObject({
    encrypted: TlvField(1, TlvByteString),
});
export type CaseSigma3 = TypeFromSchema<typeof TlvCaseSigma3>;

/** @see {@link MatterSpecification.v10.Core} § 4.13.2.3 */
export const TlvSignedData = TlvObject({
    responderNoc: TlvField(1, TlvByteString),
    responderIcac: TlvOptionalField(2, TlvByteString),
    responderPublicKey: TlvField(3, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })),
    initiatorPublicKey: TlvField(4, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })),
});
export type SignedData = TypeFromSchema<typeof TlvSignedData>;

/** @see {@link MatterSpecification.v10.Core} § 4.13.2.3 */
export const TlvEncryptedDataSigma2 = TlvObject({
    responderNoc: TlvField(1, TlvByteString),
    responderIcac: TlvOptionalField(2, TlvByteString),
    signature: TlvField(3, TlvByteString.bound({ length: CASE_SIGNATURE_LENGTH })),
    resumptionId: TlvField(4, TlvByteString.bound({ length: 16 })),
});
export type EncryptedDataSigma2 = TypeFromSchema<typeof TlvEncryptedDataSigma2>;

/** @see {@link MatterSpecification.v10.Core} § 4.13.2.3 */
export const TlvEncryptedDataSigma3 = TlvObject({
    responderNoc: TlvField(1, TlvByteString),
    responderIcac: TlvOptionalField(2, TlvByteString),
    signature: TlvField(3, TlvByteString.bound({ length: CASE_SIGNATURE_LENGTH })),
});
export type EncryptedDataSigma3 = TypeFromSchema<typeof TlvEncryptedDataSigma3>;
