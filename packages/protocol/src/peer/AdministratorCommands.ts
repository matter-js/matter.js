/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { Invoke } from "#action/request/Invoke.js";
import { ResultStatus } from "#action/response/ResultStatus.js";
import { Certificate } from "#certificate/kinds/Certificate.js";
import { TlvCertSigningRequest } from "#common/OperationalCredentialsTypes.js";
import { Bytes, Crypto, EcdsaSignature, PublicKey, UnexpectedDataError } from "@matter/general";
import { ClusterType, Status } from "@matter/types";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { CommissioningError } from "./CommissioningError.js";

/**
 * Invoke one command and return its response fields, or `undefined` for a command that answers with a status only.
 *
 * Throws the status error when the peer answers with a status other than success.
 *
 * TODO improve response typing
 */
export async function invokeSingleCommand<const C extends ClusterType.Concrete>(
    interaction: ClientInteraction,
    request: Invoke.ConcreteCommandRequest<C>,
    options: Omit<Invoke.Definition, "commands"> = {},
) {
    for await (const data of interaction.invoke(
        Invoke({
            commands: [request],
            ...options,
        }),
    )) {
        for (const entry of data) {
            // We send only one command, so we only get one response back
            switch (entry.kind) {
                case "cmd-status":
                    if (entry.status !== Status.Success) {
                        throw ResultStatus.errorOf(entry);
                    }
                    return;

                case "cmd-response":
                    return entry.data;
            }
        }
    }
}

/**
 * Validate the NOCSR information of a CSRResponse and return the node operational public key the CSR requests a
 * certificate for.
 *
 * When {@link dacPublicKey} is given, the attestation signature must verify over `nocsrElements || attestationChallenge`
 * with that key, where the challenge belongs to the secure session that carried the CSRRequest.  The CSR's own
 * signature is checked by {@link Certificate.getPublicKeyFromCsr}.
 *
 * Throws {@link UnexpectedDataError} for an empty response and {@link CommissioningError} for a signature that does not
 * verify against the DAC.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.18.4.9
 */
export async function operationalPublicKeyOfCsr(
    crypto: Crypto,
    { nocsrElements, attestationSignature }: OperationalCredentials.CsrResponse,
    attestation: { challenge: Bytes; dacPublicKey?: PublicKey },
) {
    if (nocsrElements.byteLength === 0 || attestationSignature.byteLength === 0) {
        throw new UnexpectedDataError("Invalid response from device");
    }

    if (attestation.dacPublicKey !== undefined) {
        try {
            await crypto.verifyEcdsa(
                attestation.dacPublicKey,
                Bytes.concat(nocsrElements, attestation.challenge),
                new EcdsaSignature(attestationSignature),
            );
        } catch {
            throw new CommissioningError("CSR signature verification failed against DAC public key");
        }
    }

    const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
    return await Certificate.getPublicKeyFromCsr(crypto, certSigningRequest);
}
