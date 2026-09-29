/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { InvalidGroupOperationError } from "#endpoint/errors.js";
import {
    ClientInvoke,
    ClientSubscription,
    DecodedInvokeResult,
    Read,
    ReadResult,
    Subscribe,
    Write,
    WriteResult,
} from "@matter/protocol";
import { ClientNodeInteraction } from "./ClientNodeInteraction.js";

export { InvalidGroupOperationError };

/**
 * The interaction of a {@link ClientGroup}: every request through it is a group request.
 *
 * A group message names no endpoint, so invoke and write paths must be group paths (cluster and command or attribute,
 * no endpoint); a path naming an endpoint is refused. Nobody answers a group message: a command resolves without a
 * response even where the command has one, so its typed result is always `undefined`. Reads, subscriptions and timed
 * requests are refused.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.16
 */
export class ClientGroupInteraction extends ClientNodeInteraction {
    /** Groups do not support reading or subscribing to attributes */
    override read(_request: Read, _context?: ActionContext): ReadResult {
        throw new InvalidGroupOperationError("Groups do not support reading attributes");
    }

    /** Groups do not support reading or subscribing to attributes */
    override async subscribe(_request: Subscribe, _context?: ActionContext): Promise<ClientSubscription> {
        throw new InvalidGroupOperationError("Groups do not support subscribing to attributes");
    }

    override async write<T extends Write>(
        request: T,
        context?: ActionContext,
    ): WriteResult<T & { suppressResponse: true }> {
        if (request.timedRequest) {
            throw new InvalidGroupOperationError("Timed requests are not supported for group address writes.");
        }

        if (request.suppressResponse === false) {
            // If flag was explicitly set to false, we cannot comply
            throw new InvalidGroupOperationError("Writing attributes on a group address can not return a response.");
        }

        if (
            request.writeRequests.some(
                ({ path: { endpointId, clusterId, attributeId } }) =>
                    endpointId !== undefined || clusterId === undefined || attributeId === undefined,
            )
        ) {
            throw new InvalidGroupOperationError("Not all attribute write paths are valid for group address writes.");
        }

        // Writing to a group does not yield a response
        return super.write({ ...request, suppressResponse: true }, context);
    }

    override invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        if (request.invokeRequests.some(({ commandPath: { endpointId } }) => endpointId !== undefined)) {
            throw new InvalidGroupOperationError("Invoking a concrete command on a group address is not supported.");
        }
        if (request.timedRequest) {
            throw new InvalidGroupOperationError("Timed requests are not supported for group address invokes.");
        }

        request.suppressResponse = true; // Invoking on a group does not yield a response by definition

        return super.invoke(request, context);
    }
}
