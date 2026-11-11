/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { ClientRequest } from "#action/client/ClientRequest.js";
import { Invoke } from "#action/request/Invoke.js";
import { InvokeResult } from "#action/response/InvokeResult.js";
import { ClusterType } from "@matter/types";

/**
 * Helpers for the administrator commands that the commissioning flow and the operational certificate update send over
 * a secure session they hold themselves.
 */
export namespace AdministratorCommands {
    /**
     * Invoke one command and return its response fields, or `undefined` for a command that answers with a status only.
     *
     * Throws the status error when the peer answers with a status other than success.
     *
     * TODO improve response typing
     *
     * @param transmission how the request reaches the peer, such as {@link ClientRequest.requireExistingSession}
     */
    export async function invoke<const C extends ClusterType.Concrete>(
        interaction: ClientInteraction,
        request: Invoke.ConcreteCommandRequest<C>,
        options: Omit<Invoke.Definition, "commands"> = {},
        transmission?: ClientRequest,
    ) {
        return InvokeResult.responseOfSingleCommand(
            interaction.invoke({ ...Invoke({ commands: [request], ...options }), ...transmission }),
        );
    }
}
