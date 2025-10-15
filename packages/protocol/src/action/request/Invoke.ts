/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, isObject } from "#general";
import { FALLBACK_INTERACTIONMODEL_REVISION } from "#session/Session.js";
import {
    ClusterType,
    CommandData,
    FabricIndex,
    InvokeRequest,
    ObjectSchema,
    TlvSchema,
    TlvStream,
    TypeFromSchema,
} from "#types";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { resolvePathForSpecifier, Specifier } from "./Specifier.js";

export interface InvokeCommandData extends CommandData {
    timed?: boolean;
}

export interface Invoke extends InvokeRequest {
    /** Timeout only relevant for Client Interactions */
    timeout?: Duration;
    expectedProcessingTime?: Duration;
    useExtendedFailSafeMessageResponseTimeout?: boolean;
}

export interface ClientInvoke extends Invoke {
    commands: Map<number | undefined, Invoke.CommandRequest<any>>;
}

/**
 * Request invocation of one or more commands.
 */
export function Invoke(options: Invoke.Definition): ClientInvoke;

/**
 * Request invocation multiple commands with defined options
 */
export function Invoke(options: Invoke.Definition, ...commands: Invoke.CommandRequest<any>[]): ClientInvoke;

/**
 * Request invocation multiple commands as list of Commands with default options.
 */
export function Invoke(...commands: Invoke.CommandRequest<any>[]): ClientInvoke;

export function Invoke(
    optionsOrData: Invoke.Definition | Invoke.CommandRequest<any>,
    ...commands: Invoke.CommandRequest<any>[]
): ClientInvoke {
    if (optionsOrData === undefined) {
        throw new MalformedRequestError(`Invocation requires at least one command`);
    }

    let options;
    if ("commands" in optionsOrData) {
        options = optionsOrData;
        commands = [...optionsOrData.commands, ...commands];
    } else {
        commands = [optionsOrData, ...commands];
        options = {};
    }

    const {
        interactionModelRevision = FALLBACK_INTERACTIONMODEL_REVISION,
        suppressResponse = false,
        timeout,
        expectedProcessingTime,
        useExtendedFailSafeMessageResponseTimeout = false,
        skipValidation = false,
    } = options;
    let timedRequest = !!options.timed || !!timeout;

    if (!commands?.length) {
        throw new MalformedRequestError(`Invocation requires at least one command`);
    }

    if (commands.length > 1) {
        const commandRefs = new Set<number>();
        for (const { commandRef } of commands) {
            if (commandRef === undefined) {
                throw new MalformedRequestError(`CommandRef required when invoking multiple commands`);
            }
            if (commandRefs.has(commandRef)) {
                throw new MalformedRequestError(`Duplicate commandRef ${commandRef} in multiple command invoke`);
            }
            commandRefs.add(commandRef);
        }
    }

    const commandMap = new Map<number | undefined, Invoke.CommandRequest<any>>();
    const invokeRequests: InvokeCommandData[] = commands.map(cmd => {
        const cmdData = Invoke.Command(cmd, skipValidation);
        timedRequest ||= !!cmdData.timed;
        commandMap.set(cmdData.commandRef, cmd);
        return cmdData;
    });

    return {
        timedRequest,
        timeout,
        invokeRequests,
        interactionModelRevision,
        suppressResponse,
        expectedProcessingTime,
        useExtendedFailSafeMessageResponseTimeout,

        // Additional meta-data for client side processing
        commands: commandMap,
        [Diagnostic.value]: () =>
            Diagnostic.list(
                commands.map(cmd => {
                    const { commandRef } = cmd;
                    const fields = "fields" in cmd ? cmd.fields : undefined;

                    return [
                        Diagnostic.strong(resolvePathForSpecifier(cmd)),
                        "with",
                        isObject(fields) ? Diagnostic.dict(fields) : "(no payload)",
                        commandRef !== undefined ? `(ref ${commandRef})` : "",
                    ];
                }),
            ),
    } as ClientInvoke;
}

export namespace Invoke {
    export interface Definition {
        /** List of commands to invoke */
        commands: Invoke.CommandRequest<any>[];

        /** Tell the server to not send a response */
        suppressResponse?: boolean;

        /** Whether this is sent as a timed request, if no timeout is specified a default is used */
        timed?: boolean;

        /** Timeout when sent as a timed request, if timed flag is not set it will be set automatically */
        timeout?: Duration;

        /** Interaction model revision to use, if not specified a default is used */
        interactionModelRevision?: number;

        /** Processing time of the command of the server assumed for this invoke. If not set a default is used */
        expectedProcessingTime?: Duration;

        /** Whether to use extended timeout for fail-safe messages.  Overwrites the expectedProcessingTime if both are set */
        useExtendedFailSafeMessageResponseTimeout?: boolean;

        /** Whether to skip validation of command fields against schema */
        skipValidation?: boolean;
    }

    export function Command<const C extends ClusterType>(
        request: Invoke.CommandRequest<C>,
        skipValidation = false,
    ): InvokeCommandData {
        const command = Invoke.commandOf(request);
        const { requestSchema, requestId, timed } = command;
        const { commandRef } = request;

        let commandFields: TlvStream | undefined;

        let fields: any = "fields" in request ? request.fields : undefined;
        if (requestSchema instanceof ObjectSchema) {
            if (fields === undefined) {
                // If developer did not provide a request object, create an empty one if it needs to be an object
                // This can happen when all object properties are optional
                fields = {};
            }
            if (requestSchema.isFabricScoped && fields.fabricIndex === undefined) {
                fields.fabricIndex = FabricIndex.NO_FABRIC;
            }
        }

        if (!skipValidation) {
            requestSchema.validate(fields);
        }

        commandFields = requestSchema.encodeTlv(fields);

        const result: InvokeCommandData = {
            commandPath: {
                // Endpoint id is added below if not wildcard
                clusterId: Specifier.clusterFor(request.cluster).id,
                commandId: requestId,
            },
            commandFields,
            timed: timed ?? false,
            commandRef,
        };

        // Optional endpoint is handled by the Specifier utility, so we can just cast here
        const endpointId = Specifier.endpointIdOf(request as ConcreteCommandRequest);
        if (endpointId !== undefined) {
            result.commandPath.endpointId = endpointId;
        }

        return result;
    }

    export type CommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = ConcreteCommandRequest<C, CMD> | WildcardCommandRequest<C, CMD>;

    export type ConcreteCommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = WildcardCommandRequest<C, CMD> & { endpoint: Specifier.Endpoint };

    export function ConcreteCommandRequest<const C extends ClusterType>(
        data: Invoke.ConcreteCommandRequest<C>,
    ): Invoke.ConcreteCommandRequest<any> {
        if (data.endpoint === undefined) {
            throw new MalformedRequestError(`ConcreteCommandRequest requires an endpoint`);
        }
        return data;
    }

    export type WildcardCommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = {
        cluster: C;
        command: CMD;
        commandName?: string;
        commandRef?: number;
    } & Fields<Specifier.CommandFor<Specifier.ClusterFor<C>, CMD>["requestSchema"]>;

    export function WildcardCommandRequest<const C extends ClusterType>(
        data: Invoke.WildcardCommandRequest<C>,
    ): Invoke.WildcardCommandRequest<any> {
        if ("endpoint" in data && data.endpoint !== undefined) {
            throw new MalformedRequestError(`ConcreteCommandRequest must not have an endpoint`);
        }
        return data;
    }

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
