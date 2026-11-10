/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, Bytes, Crypto, EcdsaSignature, MaybePromise, PublicKey } from "@matter/general";
import { TlvCertSigningRequest } from "../common/OperationalCredentialsTypes.js";
import { CommissioningError } from "../peer/CommissioningError.js";
import { Certificate } from "./kinds/Certificate.js";
import { isLocalDefect } from "./PeerData.js";

/** Reasons a CSRResponse fails validation. */
export enum NocsrCheck {
    /** NOCSRElements or AttestationSignature is empty. */
    ResponseEmpty = "ResponseEmpty",

    /** The AttestationSignature is malformed or does not verify with the DAC public key. */
    AttestationSignatureInvalid = "AttestationSignatureInvalid",

    /** NOCSRElements is not a valid NOCSR Information structure. */
    ElementsUnparseable = "ElementsUnparseable",

    /** The CSRNonce in NOCSRElements is not the one the commissioner sent. */
    CsrNonceMismatch = "CsrNonceMismatch",

    /** The PKCS #10 CSR is malformed, uses another algorithm or key type, or its own signature does not verify. */
    CsrInvalid = "CsrInvalid",
}

/** A CSRResponse failed one of the checks in {@link NocsrCheck}. */
export class NocsrError extends CommissioningError {
    constructor(
        readonly failure: NocsrCheck,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

export namespace NocsrValidator {
    export interface Context {
        crypto: Crypto;

        /** The attestation challenge of the secure session the CSRRequest was sent on. */
        attestationChallenge: Bytes;

        /** The CSRNonce the commissioner sent in CSRRequest. */
        csrNonce: Bytes;

        /** The public key of the device's DAC from the device attestation step. */
        dacPublicKey: PublicKey;
    }

    export interface Response {
        /** NOCSRElements of the CSRResponse. */
        nocsrElements: Bytes;

        /** AttestationSignature of the CSRResponse. */
        attestationSignature: Bytes;
    }

    /**
     * Validate a CSRResponse and return the operational public key of its CSR.
     *
     * Every check is a hard failure; unlike device attestation, no commissioning policy can accept it.
     *
     * Throws {@link NocsrError} with the failed {@link NocsrCheck}.  An `InternalError` or `ImplementationError`
     * propagates unchanged, because it is a defect of our own code, not of the device's data.
     *
     * @see {@link MatterSpecification.v161.Core} § 6.4.6.1.1
     * @see {@link MatterSpecification.v161.Core} § 11.18.4.9
     */
    export async function validate(
        { crypto, attestationChallenge, csrNonce, dacPublicKey }: Context,
        { nocsrElements, attestationSignature }: Response,
    ): Promise<Bytes> {
        if (nocsrElements.byteLength === 0 || attestationSignature.byteLength === 0) {
            throw new NocsrError(
                NocsrCheck.ResponseEmpty,
                "CSRResponse has empty NOCSRElements or AttestationSignature",
            );
        }

        await checkPeerData(
            NocsrCheck.AttestationSignatureInvalid,
            "CSRResponse AttestationSignature does not verify with the DAC public key",
            () =>
                crypto.verifyEcdsa(
                    dacPublicKey,
                    Bytes.concat(nocsrElements, attestationChallenge),
                    new EcdsaSignature(attestationSignature),
                ),
        );

        const info = await checkPeerData(
            NocsrCheck.ElementsUnparseable,
            "CSRResponse NOCSRElements cannot be decoded",
            () => TlvCertSigningRequest.decode(nocsrElements),
        );

        if (!Bytes.areEqual(info.csrNonce, csrNonce)) {
            throw new NocsrError(
                NocsrCheck.CsrNonceMismatch,
                "CSRNonce in the CSRResponse does not match the nonce sent to the device",
            );
        }

        return checkPeerData(NocsrCheck.CsrInvalid, "CSRResponse contains an invalid CSR", () =>
            Certificate.getPublicKeyFromCsr(crypto, info.certSigningRequest),
        );
    }
}

/** Run a step over the device's data and report its failure as {@link check}. */
async function checkPeerData<T>(check: NocsrCheck, description: string, step: () => MaybePromise<T>): Promise<T> {
    try {
        return await step();
    } catch (cause) {
        if (isLocalDefect(cause)) {
            throw cause;
        }
        throw new NocsrError(check, `${description}: ${asError(cause).message}`, { cause });
    }
}
