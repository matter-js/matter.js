/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientRequest } from "#action/client/ClientRequest.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Diagnostic, Duration, isObject } from "@matter/general";
import {
    ClusterNamespace,
    CommandData,
    CommandId,
    FabricIndex,
    InvokeRequest,
    ObjectSchema,
    TlvOfModel,
    TlvSchema,
    TlvVoid,
} from "@matter/types";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { resolvePathForSpecifier, Specifier } from "./Specifier.js";

export interface InvokeCommandData extends CommandData {
    timed?: boolean;
}

export interface Invoke extends InvokeRequest {
    /** Timeout only relevant for Client Interactions */
    timeout?: Duration;

    /** Expected processing time of the command on the server side to calculated response timeout */
    expectedProcessingTime?: Duration;

    /** Whether to use extended timeout for fail-safe messages.  Overwrites the expectedProcessingTime if both are set */
    useExtendedFailSafeMessageResponseTimeout?: boolean;

    /**
     * Controls automatic command batching for single-command invokes.
     *
     * - `undefined` — batch with zero delay (commands in the same timer tick are combined)
     * - `Duration` — batch with the specified collection window
     * - `false` — disable batching; execute immediately
     */
    batchDuration?: false | Duration;
}

export interface CommandDecodeDetails {
    responseSchema: TlvSchema<any>;
    [Diagnostic.value]: () => unknown;
}

export interface ClientInvoke extends Invoke, ClientRequest {
    commands: Map<number | undefined, Invoke.AnyCommandRequest>;
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
    ...commands: (Invoke.CommandRequest<any> | Invoke.LegacyCommandRequest)[]
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
        interactionModelRevision = SessionParameters.fallbacks.interactionModelRevision,
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

    const commandMap = new Map<number | undefined, Invoke.AnyCommandRequest>();
    const invokeRequests: InvokeCommandData[] = commands.map(cmd => {
        const cmdData = Invoke.Command(cmd, skipValidation);
        if (options.timed !== false) {
            // When timed in options are set to false, we respect that even if we know it better
            timedRequest ||= !!cmdData.timed;
        }
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
                        Diagnostic.strong(Invoke.isLegacy(cmd) ? "(legacy)" : resolvePathForSpecifier(cmd)),
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
        commands: (Invoke.CommandRequest<any> | Invoke.LegacyCommandRequest)[];

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

    export function Command<const C extends Specifier.ClusterLike>(
        request: Invoke.CommandRequest<C>,
        skipValidation?: boolean,
    ): InvokeCommandData;

    /**
     * @deprecated
     * Use {@link CommandRequest} with {@link ClusterNamespace.Command}.
     */
    export function Command(request: Invoke.LegacyCommandRequest, skipValidation?: boolean): InvokeCommandData;

    export function Command(request: Invoke.AnyCommandRequest, skipValidation?: boolean): InvokeCommandData;

    export function Command(
        request: Invoke.CommandRequest<any> | Invoke.LegacyCommandRequest,
        skipValidation = false,
    ): InvokeCommandData {
        let requestSchema: TlvSchema<any>;
        let requestId: CommandId;
        let timed: boolean;

        if (typeof request.command !== "string" && "requestId" in request.command) {
            // Legacy ClusterTypeCommand — extract fields directly
            const legacy = request.command as Specifier.ClusterTypeCommand;
            requestSchema = legacy.requestSchema;
            requestId = legacy.requestId;
            timed = legacy.timed;
        } else {
            const command = Invoke.commandOf(request as CommandRequest);
            requestSchema = TlvOfModel(command.schema) ?? TlvVoid;
            requestId = command.id;
            timed = command.schema.effectiveAccess.timed === true;
        }

        const { commandRef } = request;

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

        const commandFields = requestSchema.encodeTlv(fields);

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

    /**
     * @deprecated
     * Legacy command request using ClusterType commands.  Use {@link CommandRequest} with
     * {@link ClusterNamespace.Command}.
     */
    export interface LegacyCommandRequest {
        cluster: Specifier.Cluster;
        command: Specifier.ClusterTypeCommand;
        endpoint?: Specifier.Endpoint;
        fields?: unknown;
        commandName?: string;
        commandRef?: number;
    }

    /**
     * Union of new-style and legacy command requests.
     */
    export type AnyCommandRequest = CommandRequest<any> | LegacyCommandRequest;

    /**
     * Type guard for legacy command requests.
     */
    export function isLegacy(request: AnyCommandRequest): request is LegacyCommandRequest {
        return typeof request.command !== "string" && "requestId" in request.command;
    }

    export type CommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = ConcreteCommandRequest<C, CMD> | WildcardCommandRequest<C, CMD>;

    export type ConcreteCommandRequest<
        C extends Specifier.Cluster = Specifier.Cluster,
        CMD extends Specifier.Command<Specifier.ClusterFor<C>> = Specifier.Command<Specifier.ClusterFor<C>>,
    > = WildcardCommandRequest<C, CMD> & { endpoint: Specifier.Endpoint };

    /**
     * @deprecated
     * Use the overload accepting {@link ConcreteCommandRequest}.
     */
    export function ConcreteCommandRequest(data: Invoke.LegacyCommandRequest): Invoke.LegacyCommandRequest;

    export function ConcreteCommandRequest<const C extends Specifier.ClusterLike>(
        data: Invoke.ConcreteCommandRequest<C>,
    ): Invoke.ConcreteCommandRequest<any>;

    export function ConcreteCommandRequest(
        data: Invoke.ConcreteCommandRequest<any> | Invoke.LegacyCommandRequest,
    ): Invoke.ConcreteCommandRequest<any> | Invoke.LegacyCommandRequest {
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
    } & Fields<Specifier.CommandFor<Specifier.ClusterFor<C>, CMD>>;

    /**
     * @deprecated
     * Use the overload accepting {@link WildcardCommandRequest}.
     */
    export function WildcardCommandRequest(data: Invoke.LegacyCommandRequest): Invoke.LegacyCommandRequest;

    export function WildcardCommandRequest<const C extends Specifier.ClusterLike>(
        data: Invoke.WildcardCommandRequest<C>,
    ): Invoke.WildcardCommandRequest<any>;

    export function WildcardCommandRequest(
        data: Invoke.WildcardCommandRequest<any> | Invoke.LegacyCommandRequest,
    ): Invoke.WildcardCommandRequest<any> | Invoke.LegacyCommandRequest {
        if ("endpoint" in data && data.endpoint !== undefined) {
            throw new MalformedRequestError(`ConcreteCommandRequest must not have an endpoint`);
        }
        return data;
    }

    /**
     * Extract the command element from a command request.
     */
    export function commandOf<const R extends CommandRequest>(request: R): ClusterNamespace.Command {
        if (typeof request.command === "string") {
            const cluster = Specifier.clusterFor(request.cluster);
            const command = cluster.commands?.[request.command];
            if (command === undefined) {
                throw new MalformedRequestError(`Cluster ${cluster.name} does not define command ${request.command}`);
            }
            return command;
        }
        return request.command;
    }

    /**
     * Extract the request type from a command's function signature phantom type.
     */
    export type RequestOf<C extends ClusterNamespace.Command = ClusterNamespace.Command> =
        C extends ClusterNamespace.Command<infer F>
            ? F extends (request: infer R, ...args: unknown[]) => unknown
                ? R
                : void
            : void;

    export type Fields<C extends ClusterNamespace.Command> =
        RequestOf<C> extends void
            ? {}
            : undefined extends RequestOf<C>
              ? { fields?: RequestOf<C> }
              : { fields: RequestOf<C> };
}
