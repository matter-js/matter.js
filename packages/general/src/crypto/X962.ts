/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerBitString, DerObject, ObjectId } from "#codec/DerCodec.js";
import { Bytes } from "#util/Bytes.js";

export namespace X962 {
    export const PublicKeyEcPrime256v1 = (key: Bytes) => ({
        type: {
            algorithm: PublicKeyAlgorithmEcPublicKey /* EC Public Key */,
            curve: PublicKeyAlgorithmEcPublicKeyP256 /* Curve P256_V1 */,
        },
        bytes: DerBitString(key),
    });
    export const EcdsaWithSHA256 = DerObject("2A8648CE3D040302");
    export const PublicKeyAlgorithmEcPublicKey = ObjectId("2A8648CE3D0201");
    export const PublicKeyAlgorithmEcPublicKeyP256 = ObjectId("2A8648CE3D030107");
}
