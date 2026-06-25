/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "@matter/general";
import { ConformanceError, DatatypeError, UnknownEnumValueError } from "@matter/protocol";
import { Status } from "@matter/types";
import type { ValueSupervisor } from "../../supervision/ValueSupervisor.js";

const logger = Logger.get("ValueValidator");

/**
 * Decide whether a validation error on a write to a peer (client) node should be forwarded to the device rather than
 * rejected locally.  The peer is the authority on what it accepts, so conformance violations and values the local model
 * cannot vouch for (undefined enum values, reserved bitmap bits) are sent on for the device to adjudicate; the local
 * mirror compensates if the device rejects.  Value-range constraints and structural datatype errors stay local: they
 * are caller bugs or cannot be encoded for the wire.
 *
 * Only outbound writes reach here: inbound peer reports bypass validation entirely (Datasource.integrateExternalChange),
 * so the broader presence of clientPeerContext on any client-node act() does not cause inbound data to be swallowed.
 *
 * Returns true if the error was forwarded (and logged); false if the caller should rethrow.
 */
export function forwardValidationToPeer(session: ValueSupervisor.Session, error: unknown): boolean {
    if (session.clientPeerContext === undefined) {
        return false;
    }

    // Reserved-bit and undefined-enum violations are the only ConstraintError-coded DatatypeErrors; structural type
    // mismatches are InvalidDataType-coded and value-range errors are ConstraintError/IntegerRangeError (not
    // DatatypeError), so both correctly fall through to a rethrow.
    if (
        error instanceof ConformanceError ||
        error instanceof UnknownEnumValueError ||
        (error instanceof DatatypeError && error.code === Status.ConstraintError)
    ) {
        logger.debug(
            "Forwarding non-conformant write to peer; the device may reject it:",
            Diagnostic.errorMessage(error),
        );
        return true;
    }

    return false;
}
