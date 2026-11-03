/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "@matter/general";
import { ClusterModel } from "@matter/model";
import {
    ConformanceError,
    ConstraintError,
    DatatypeError,
    UnknownEnumValueError,
    ValidateError,
} from "@matter/protocol";
import { Status } from "@matter/types";
import type { RootSupervisor } from "../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import type { ValidationLocation } from "./location.js";

const logger = Logger.get("ValueValidator");

/**
 * Wrap a validator so a write to a peer (client) node forwards a validation error to the device rather than rejecting
 * it locally.
 *
 * Forwarding applies only when the root schema of {@link supervisor} is a cluster, because only cluster state mirrors a
 * device and goes to the peer on write.  Other behavior state on a client node, such as commissioning or network
 * parameters, stays local and is validated as on a server.  For such a supervisor the validator is returned unchanged.
 * Only the root schema is checked, so a typed local-only field added to a cluster client subclass also forwards.
 *
 * The device decides what it accepts: the local model cannot know the device's revision, its feature-dependent lists
 * or the values it supports, and the specification places these checks on the server.  So every error raised for a
 * value the wire can still carry is forwarded, and the local copy takes the value only if the device accepts it.
 * A command request is still checked against its TLV bounds when the invoke request is built (`Invoke.ts`):
 *
 * | Error                                           | Raised for                                           | Client write |
 * |-------------------------------------------------|------------------------------------------------------|--------------|
 * | {@link ConformanceError} (and subclasses)       | element or enum value violates conformance           | forwarded    |
 * | {@link ConstraintError}                         | model constraint: range, length, `in`, list size, …  | forwarded    |
 * | {@link UnknownEnumValueError}                   | enum value Matter does not define for this enum      | forwarded    |
 * | {@link DatatypeError} with CONSTRAINT_ERROR     | enum value not among the enum's members, reserved    | forwarded    |
 * |                                                 | bitmap bits set                                      |              |
 * | {@link DatatypeError} with INVALID_DATA_TYPE    | wrong JS type, unknown bitmap flag, bit field too    | local        |
 * |                                                 | wide for its bits                                    |              |
 * | `IntegerRangeError`                             | integer outside its wire type (uint8, int16, …)      | local        |
 *
 * The local errors stay local because the TLV encoder cannot write the value.  A bit field set directly through
 * `BitmapManager` throws {@link ConstraintError} from its setter, outside validation, so that error also stays local.
 *
 * Inbound peer reports bypass validation entirely (DatasourceCache.externalSet).  A command response that the Remote
 * API validates on a peer session goes through here, so a response the device sent is accepted as it is.
 *
 * A forwarded error is logged at debug.
 */
export function withPeerForwarding(
    supervisor: RootSupervisor,
    validate: ValueSupervisor.Validate,
): ValueSupervisor.Validate {
    if (!isPeerForwarding(supervisor)) {
        return validate;
    }

    return (value, session, location) => {
        try {
            validate(value, session, location);
        } catch (e) {
            if (!forwardToPeer(session, location, e)) {
                throw e;
            }
        }
    };
}

/**
 * Whether {@link withPeerForwarding} applies to a validator built for {@link supervisor}.
 */
export function isPeerForwarding(supervisor: RootSupervisor) {
    return supervisor.schema instanceof ClusterModel;
}

/**
 * Decide whether a validation error of a peer write is forwarded, and log it once per value.
 *
 * A caller that continues with further checks of the same value after a forwarded error passes the returned location
 * on, so the following check does not log the same value again.
 *
 * @returns the location to use for the following checks, or undefined if the error is not forwarded
 */
export function forwardToPeer(
    session: ValueSupervisor.Session,
    location: ValidationLocation,
    error: unknown,
): ValidationLocation | undefined {
    if (session.clientPeerContext === undefined || !isForwardable(error)) {
        return undefined;
    }
    if (location.forwarded) {
        return location;
    }
    logger.debug("Sending a value the local model refuses; the device decides:", Diagnostic.errorMessage(error));
    return { ...location, forwarded: true };
}

function isForwardable(error: unknown): error is ValidateError {
    // IntegerRangeError carries CONSTRAINT_ERROR too, so forwarding must not rely on the status code alone
    return (
        error instanceof ConformanceError ||
        error instanceof ConstraintError ||
        error instanceof UnknownEnumValueError ||
        (error instanceof DatatypeError && error.code === Status.ConstraintError)
    );
}
