/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedTransportsBitmap } from "#common/SupportedTransportsBitmap.js";
import { CRYPTO_HASH_LEN_BYTES, CRYPTO_PUBLIC_KEY_SIZE_BYTES } from "#general";
import { SessionIntervals } from "#session/SessionIntervals.js";
import {
    TlvBitmap,
    TlvBoolean,
    TlvByteString,
    TlvField,
    TlvObject,
    TlvOptionalField,
    TlvUInt16,
    TlvUInt32,
    TypeFromSchema,
} from "#types";

/** @see {@link MatterSpecification.v13.Core} § 4.12.8 */
export const TlvSessionParameters = TlvObject({
    /** Maximum sleep interval of node when in idle mode. */
    idleInterval: TlvOptionalField(1, TlvUInt32) /* default: SESSION_IDLE_INTERVAL */,

    /** Maximum sleep interval of node when in active mode. */
    activeInterval: TlvOptionalField(2, TlvUInt32) /* default: SESSION_ACTIVE_INTERVAL */,

    /** Minimum amount of time the node SHOULD stay active after network activity. */
    activeThreshold: TlvOptionalField(3, TlvUInt16) /* default: SESSION_ACTIVE_THRESHOLD */,

    /** Data model revision. */
    dataModelRevision: TlvOptionalField(4, TlvUInt16) /* default: 16 OR 17, we choose 17 aka Matter 1.2 */,

    /** Interaction model revision. */
    interactionModelRevision: TlvOptionalField(5, TlvUInt16) /* default 10 OR 11, we choose 11 aka Matter 1.2 */,

    /** Specification version. */
    specificationVersion: TlvOptionalField(6, TlvUInt32) /* default: STRICTLY SMALLER THAN 0x01030000, we choose 0 */,

    /** Maximum Paths pert Invoke */
    maxPathsPerInvoke: TlvOptionalField(7, TlvUInt16) /* default: 1 */,

    /** Supported transport protocols in addition to MRP.*/
    supportedTransports: TlvOptionalField(8, TlvBitmap(TlvUInt16, SupportedTransportsBitmap)) /* default: {} */,

    /** Maximum size of the message carried over TCP in bytes */
    maxTcpMessageSize: TlvOptionalField(9, TlvUInt32) /* default: 64000 */,
});

// Replace the interval fields with Duration-typed fields in the exported type
export type SessionParametersWithDurations = Omit<
    TypeFromSchema<typeof TlvSessionParameters>,
    "activeThreshold" | "activeInterval" | "idleInterval"
> &
    Partial<SessionIntervals>;

export type WithDurationSessionParameters<T, K extends keyof T> = Omit<T, K> & {
    [P in K]?: SessionParametersWithDurations;
};

/** @see {@link MatterSpecification.v13.Core} § 4.14.1.2 */
export const TlvPbkdfParamRequest = TlvObject({
    initiatorRandom: TlvField(1, TlvByteString.bound({ length: 32 })),
    initiatorSessionId: TlvField(2, TlvUInt16), // Specs: range: 16bits
    passcodeId: TlvField(3, TlvUInt16), // Specs: length: 16bits so min is 0x8000?
    hasPbkdfParameters: TlvField(4, TlvBoolean),
    initiatorSessionParams: TlvOptionalField(5, TlvSessionParameters),
});
export type PbkdfParamRequest = WithDurationSessionParameters<
    TypeFromSchema<typeof TlvPbkdfParamRequest>,
    "initiatorSessionParams"
>;

/** @see {@link MatterSpecification.v13.Core} § 4.14.1.2 */
export const TlvPbkdfParamResponse = TlvObject({
    initiatorRandom: TlvField(1, TlvByteString.bound({ length: 32 })),
    responderRandom: TlvField(2, TlvByteString.bound({ length: 32 })),
    responderSessionId: TlvField(3, TlvUInt16),
    pbkdfParameters: TlvOptionalField(
        4,
        TlvObject({
            iterations: TlvField(1, TlvUInt32),
            salt: TlvField(2, TlvByteString.bound({ minLength: 16, maxLength: 32 })),
        }),
    ),
    responderSessionParams: TlvOptionalField(5, TlvSessionParameters),
});
export type PbkdfParamResponse = WithDurationSessionParameters<
    TypeFromSchema<typeof TlvPbkdfParamResponse>,
    "responderSessionParams"
>;

/** @see {@link MatterSpecification.v13.Core} § 4.14.1.2 */
export const TlvPasePake1 = TlvObject({
    x: TlvField(1, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })), // pA
});
export type PasePake1 = TypeFromSchema<typeof TlvPasePake1>;

/** @see {@link MatterSpecification.v13.Core} § 4.14.1.2 */
export const TlvPasePake2 = TlvObject({
    y: TlvField(1, TlvByteString.bound({ length: CRYPTO_PUBLIC_KEY_SIZE_BYTES })), // pB
    verifier: TlvField(2, TlvByteString.bound({ length: CRYPTO_HASH_LEN_BYTES })), // cB
});
export type PasePake2 = TypeFromSchema<typeof TlvPasePake2>;

/** @see {@link MatterSpecification.v13.Core} § 4.14.1.2 */
export const TlvPasePake3 = TlvObject({
    verifier: TlvField(1, TlvByteString.bound({ length: CRYPTO_HASH_LEN_BYTES })), // cA
});
export type PasePake3 = TypeFromSchema<typeof TlvPasePake3>;
