/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/index.js";
import { ImplementationError } from "#general";
import {
    ClientInvoke,
    DecodedInvokeResult,
    Read,
    ReadResult,
    Subscribe,
    SubscribeResult,
    Write,
    WriteResult,
} from "#protocol";
import { ClientNodeInteraction } from "./ClientNodeInteraction.js";

export class ClientGroupInteraction extends ClientNodeInteraction {
    /** Groups do not support reading or subscribing to attributes */
    override read(_request: Read, _context?: ActionContext): ReadResult {
        throw new ImplementationError("Groups do not support reading attributes");
    }

    /** Groups do not support reading or subscribing to attributes */
    override async subscribe(_request: Subscribe, _context?: ActionContext): SubscribeResult {
        throw new ImplementationError("Groups do not support subscribing to attributes");
    }

    override async write<T extends Write>(
        request: T,
        context?: ActionContext,
    ): WriteResult<T & { suppressResponse: true }> {
        if (request.timedRequest) {
            throw new ImplementationError("Timed requests are not supported for group address writes.");
        }

        if (request.suppressResponse === false) {
            // If flag was explicitly set to false, we cannot comply
            throw new ImplementationError("Writing attributes on a group address can not return a response.");
        }

        if (
            request.writeRequests.some(
                ({ path: { endpointId, clusterId, attributeId } }) =>
                    endpointId !== undefined || clusterId === undefined || attributeId === undefined,
            )
        ) {
            throw new ImplementationError("Not all attribute write paths are valid for group address writes.");
        }

        // Writing to a group does not yield a response
        return super.write({ ...request, suppressResponse: true }, context);
    }

    override invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        if (request.invokeRequests.some(({ commandPath: { endpointId } }) => endpointId !== undefined)) {
            throw new ImplementationError("Invoking a concrete command on a group address is not supported.");
        }
        if (request.timedRequest) {
            throw new ImplementationError("Timed requests are not supported for group address invokes.");
        }

        return super.invoke(request, context);
    }
}
