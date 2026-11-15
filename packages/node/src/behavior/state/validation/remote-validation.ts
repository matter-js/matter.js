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
 * Wrap a validator so that a validation error of a value sent to or received from a remote node, a peer or a group, is
 * left to the device to decide on rather than thrown locally.
 *
 * This applies only when the root schema of {@link supervisor} is a cluster, because only cluster state is a copy of a
 * device's values and goes to the device on write.  Other behavior state on a client node, such as commissioning or
 * network parameters, stays local and is validated as on a server.  For such a supervisor the validator is returned
 * unchanged.  Only the root schema is checked, so a typed local-only field added to a cluster client subclass is also
 * left to the device.
 *
 * The device decides what it accepts: the local model cannot know the device's revision, its feature-dependent lists
 * or the values it supports, and the specification places these checks on the server.  So every error raised for a
 * value the wire can still carry is left to the device, and the local copy takes the value only if the device accepts
 * it.  A command request is still checked against its TLV bounds when the invoke request is built (`Invoke.ts`):
 *
 * | Error                                        | Raised for                                         | Remote value |
 * |----------------------------------------------|----------------------------------------------------|--------------|
 * | {@link ConformanceError} (and subclasses)    | element or enum value violates conformance         | not thrown   |
 * | {@link ConstraintError}                      | model constraint: range, length, `in`, list size, …| not thrown   |
 * | {@link UnknownEnumValueError}                | enum value Matter does not define for this enum    | not thrown   |
 * | {@link DatatypeError} with CONSTRAINT_ERROR  | enum value not among the enum's members, reserved  | not thrown   |
 * |                                              | bitmap bits set                                    |              |
 * | {@link DatatypeError} with INVALID_DATA_TYPE | wrong JS type, unknown bitmap flag, bit field too  | thrown       |
 * |                                              | wide for its bits                                  |              |
 * | `IntegerRangeError`                          | integer outside its wire type (uint8, int16, …)    | thrown       |
 *
 * The thrown errors stay local because the TLV encoder cannot write the value.  A bit field set directly through
 * `BitmapManager` throws {@link ConstraintError} from its setter, outside validation, so that error is also thrown.
 *
 * This applies where the validation location has a {@link ValidationLocation.remote}.  Peer reports bypass validation
 * entirely (DatasourceCache.externalSet).  A command response the Remote API validates as received from the device goes
 * through here too, so a response field that breaks a model constraint is accepted.
 *
 * An error left to the device is logged at debug.
 */
export function leaveErrorsToRemote(
    supervisor: RootSupervisor,
    validate: ValueSupervisor.Validate,
): ValueSupervisor.Validate {
    if (!mayLeaveToRemote(supervisor)) {
        return validate;
    }

    return (value, session, location) => {
        try {
            validate(value, session, location);
        } catch (e) {
            if (!leaveToRemote(location, e)) {
                throw e;
            }
        }
    };
}

/**
 * Whether {@link leaveErrorsToRemote} applies to a validator built for {@link supervisor}.
 */
export function mayLeaveToRemote(supervisor: RootSupervisor) {
    return supervisor.schema instanceof ClusterModel;
}

/**
 * Decide whether a validation error of a value sent to or received from a remote node is left to the device, and log
 * it at debug if so.  Each check left to the device logs its own line, so a value that breaks several checks logs
 * several lines.
 *
 * @returns true if the error is left to the device, false if the caller rethrows it
 */
export function leaveToRemote(location: ValidationLocation, error: unknown): boolean {
    if ((location.remote !== "outbound" && location.remote !== "inbound") || !isLeftToRemote(error)) {
        return false;
    }
    logger.debug("Not refusing a value the local model rejects; the device decides:", Diagnostic.errorMessage(error));
    return true;
}

function isLeftToRemote(error: unknown): error is ValidateError {
    // IntegerRangeError carries CONSTRAINT_ERROR too, so the decision must not rely on the status code alone
    return (
        error instanceof ConformanceError ||
        error instanceof ConstraintError ||
        error instanceof UnknownEnumValueError ||
        (error instanceof DatatypeError && error.code === Status.ConstraintError)
    );
}
