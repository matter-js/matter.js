/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { InvalidGroupOperationError } from "#endpoint/errors.js";
import {
    ClientInvoke,
    Invoke,
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
 * A group message names no endpoint, because it reaches every endpoint of each receiving node that is a member of the
 * group, has the addressed cluster and is admitted by the node's Group ACL entry. So the endpoint of an invoke path is
 * removed before the command is sent, whichever endpoint of the group the caller used.  A write must already name a
 * group path (cluster and attribute, no endpoint); one naming an endpoint is refused.
 *
 * Nobody answers a group message. A write resolves without statuses, and a command resolves without a response even
 * where the command has one, so its typed result is always `undefined`. Reads, subscriptions and timed requests are
 * refused.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.16
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
        // The wire paths, the command table and the logged request must all name no endpoint, so all three are built
        // from the commands afresh
        const groupInvoke = Invoke({
            commands: [...request.commands.values()].map(command => ({ ...command, endpoint: undefined })),
            suppressResponse: true,
            timed: request.timedRequest,
            timeout: request.timeout,
            expectedProcessingTime: request.expectedProcessingTime,
            useExtendedFailSafeMessageResponseTimeout: request.useExtendedFailSafeMessageResponseTimeout,
            interactionModelRevision: request.interactionModelRevision,
            skipValidation: request.skipValidation,
        });

        if (groupInvoke.timedRequest) {
            throw new InvalidGroupOperationError("Timed requests are not supported for group address invokes.");
        }

        return super.invoke({ ...request, ...groupInvoke }, context);
    }
}
