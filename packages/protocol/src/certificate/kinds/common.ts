/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError } from "@matter/general";

/**
 * Matter specific Certificate Sizes
 * @see {@link MatterSpecification.v16.Core} 6.1.3.
 */
export const MAX_DER_CERTIFICATE_SIZE = 600;

/**
 * Maximum size of an attestation certificate that uses ML-DSA (PQC Phase 1); {@link MAX_DER_CERTIFICATE_SIZE} applies
 * only to traditional chains.
 */
export const MAX_PQC_DER_CERTIFICATE_SIZE = 10240;

export type Unsigned<Type> = { [Property in keyof Type as Exclude<Property, "signature">]: Type[Property] };

export function assertCertificateDerSize(certBytes: Bytes, maximum = MAX_DER_CERTIFICATE_SIZE) {
    if (certBytes.byteLength > maximum) {
        throw new ImplementationError(
            `Certificate to generate is too big: ${certBytes.byteLength} bytes instead of max ${maximum} bytes`,
        );
    }
}
