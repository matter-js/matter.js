/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, ImplementationError } from "@matter/general";
import { DclCertificateService } from "@matter/main/protocol";
import type { ControllerAdapterOptions } from "@matter/testing";

/** The revocation set a case declared in {@link ControllerAdapterOptions.revocationSet}, as text and as read. */
export interface DeclaredRevocationSet {
    text: string;
    entries: DclCertificateService.RevocationSetEntry[];
}

/**
 * Reads the revocation set a case declared, the same way on every controller, so a declaration one controller would
 * refuse fails on all of them.
 *
 * @throws ImplementationError for a set without `attestation`, or one that is not a revocation set
 */
export function declaredRevocationSet(
    adapterId: string,
    options: ControllerAdapterOptions | undefined,
): DeclaredRevocationSet | undefined {
    const text = options?.revocationSet;
    if (text === undefined) {
        return undefined;
    }
    if (options?.attestation !== true) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}": revocationSet needs attestation, since a controller that does not ` +
                "judge attestation never consults it",
        );
    }
    return { text, entries: revocationSetOf(adapterId, "revocationSet", text) };
}

/**
 * The entries of `revocationSet`, after checking that it is the set the case declared. Two texts are the same set
 * where they read as the same entries.
 *
 * @throws ImplementationError where the case declared no set, `revocationSet` is not a revocation set, or it differs
 * from the declared one
 */
export function assertDeclaredRevocationSet(
    adapterId: string,
    declared: DeclaredRevocationSet | undefined,
    revocationSet: string,
): DclCertificateService.RevocationSetEntry[] {
    if (declared === undefined) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}" was not built with a revocation set: declare it in the case's ` +
                "revocationSet",
        );
    }
    const entries = revocationSetOf(adapterId, "the revocation set to install", revocationSet);
    if (JSON.stringify(entries) !== JSON.stringify(declared.entries)) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}": the revocation set differs from the one the case's revocationSet ` +
                `declares (${entries.length} entries given, ${declared.entries.length} declared)`,
        );
    }
    return entries;
}

function revocationSetOf(adapterId: string, what: string, text: string) {
    try {
        return DclCertificateService.parseRevocationSet(text);
    } catch (error) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}": ${what} is not a revocation set: ${asError(error).message}`,
            { cause: error },
        );
    }
}
