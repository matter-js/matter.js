/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FALLBACK_INTERACTIONMODEL_REVISION } from "#session/Session.js";
import { ClusterType, CommandData, InvokeRequest, TlvSchema, TlvStream, TypeFromSchema } from "#types";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { Specifier } from "./Specifier.js";

export interface Invoke extends InvokeRequest {
    /** Timeout only relevant for Client Interactions */
    timeout?: number;
}

/**
 * Request invocation of one or more commands.
 */
export function Invoke(options: Invoke.Definition): Invoke;

/**
 * Request invocation multiple commands with defined options
 */
export function Invoke(options: Invoke.Definition, ...commands: CommandData[]): Invoke;

/**
 * Request invocation multiple commands as list of Commands with default options.
 */
export function Invoke(...commands: CommandData[]): Invoke;

export function Invoke(optionsOrData: Invoke.Definition | CommandData, ...commands: CommandData[]): Invoke {
    if (optionsOrData === undefined) {
        throw new MalformedRequestError(`Invocation requires at least one command`);
    }

    let options;
    if ("commands" in optionsOrData) {
        options = optionsOrData;
    } else {
        commands = [optionsOrData, ...commands];
        options = {};
    }

    const {
        commands: invokeRequests = [],
        interactionModelRevision = FALLBACK_INTERACTIONMODEL_REVISION,
        suppressResponse = false,
        timed: timedRequest = false,
    } = options;

    if (commands.length) {
        for (const entry of commands) {
            invokeRequests.push(entry);
        }
    }

    if (!invokeRequests?.length) {
        throw new MalformedRequestError(`Invocation requires at least one command`);
    }

    return {
        invokeRequests,
        interactionModelRevision,
        suppressResponse,
        timedRequest,
    };
}

export namespace Invoke {
    export interface Definition {
        commands: CommandData[];
        suppressResponse?: boolean;
        timed?: boolean;
        interactionModelRevision?: number;
    }

    export function Command<const C extends ClusterType>(request: Invoke.CommandRequest<C>): CommandData {
        const command = Invoke.commandOf(request);

        let commandFields: TlvStream | undefined;

        if ("fields" in request) {
            commandFields = command.requestSchema.encodeTlv(request.fields, { forWriteInteraction: true });
        }

        const result: CommandData = {
            commandPath: {
                clusterId: Specifier.clusterFor(request.cluster).id,
                commandId: command.requestId,
            },
            commandFields,
        };

        const endpointId = Specifier.endpointIdOf(request);
        if (endpointId !== undefined) {
            result.commandPath.endpointId = endpointId;
        }

        return result;
    }

    export type CommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = {
        endpoint?: Specifier.Endpoint;
        cluster: C;
        command: CMD;
    } & Fields<Specifier.CommandFor<Specifier.ClusterFor<C>, CMD>["requestSchema"]>;

    export function commandOf<const R extends CommandRequest>(request: R): ClusterType.Command {
        if (typeof request.command === "string") {
            const cluster = Specifier.clusterFor(request.cluster);
            if (cluster === undefined) {
                throw new MalformedRequestError(`Cannot designate command "${request.command}" without cluster`);
            }
            const command = cluster.commands[request.command];
            if (command === undefined) {
                throw new MalformedRequestError(`Cluster ${cluster.name} does not define command ${request.command}`);
            }
            return command as Specifier.CommandFor<Specifier.ClusterOf<R>, R["command"]>;
        }
        return request.command as Specifier.CommandFor<Specifier.ClusterOf<R>, R["command"]>;
    }

    export type Fields<S extends TlvSchema<any>> =
        S extends TlvSchema<void>
            ? {}
            : S extends TlvSchema<null>
              ? { fields?: TypeFromSchema<S> }
              : { fields: TypeFromSchema<S> };
}
