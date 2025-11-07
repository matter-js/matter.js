/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionSession } from "#action/Interactable.js";
import { CommandInvokeHandler, CommandTypeProtocol, EndpointProtocol, NodeProtocol } from "#action/protocols.js";
import { Invoke } from "#action/request/Invoke.js";
import { InvokeResult } from "#action/response/InvokeResult.js";
import { AccessControl, hasRemoteActor } from "#action/server/AccessControl.js";
import { DataResponse, FallbackLimits } from "#action/server/DataResponse.js";
import { Diagnostic, InternalError, Logger } from "#general";
import { CommandModel, DataModelPath, ElementTag, FabricIndex as FabricIndexField } from "#model";
import {
    CommandPath,
    EndpointNumber,
    FabricIndex,
    Status,
    StatusCode,
    StatusResponseError,
    TlvSchema,
    TlvStream,
    ValidationError,
} from "#types";
import { Subject } from "./Subject.js";

const logger = Logger.get("CommandInvokeResponse");

/**
 * Implements invoking of commands for matter "invoke" interactions.
 *
 * TODO - profile; ensure nested functions are properly JITed and/or inlined
 */
export class CommandInvokeResponse<
    SessionT extends InteractionSession = InteractionSession,
> extends DataResponse<SessionT> {
    #fabricIndex: FabricIndex;

    // The initial "chunk" may be a list of errors.  As producers execute it is a set of records associated with the
    // most recently touched endpoint.  When the endpoint changes the previous chunk emits
    #chunk?: InvokeResult.Data[];

    // Each input CommandDataIB that does not have an error installs a producer.  Producers run after validation and
    // generate actual command data
    #invokers?: Array<(this: CommandInvokeResponse) => AsyncIterable<InvokeResult.Chunk>>;

    // The following state updates as data producers execute.  This serves both to convey state between functions and as
    // a cache between producers that touch the same endpoint and/or cluster
    #currentEndpoint?: EndpointProtocol;

    #registeredPaths = new Set<string>();
    #registeredCommandRefs = new Set<number>();

    // Count how many command status (on error) and command invokes (success) we have emitted
    #statusCount = 0;
    #successCount = 0;
    #errorCount = 0;

    constructor(node: NodeProtocol, session: SessionT) {
        super(node, session);
        this.#fabricIndex = session.fabric ?? FabricIndex.NO_FABRIC;
    }

    async *process<T extends Invoke>({ invokeRequests, suppressResponse }: T): InvokeResult {
        const multipleInvokes = invokeRequests.length > 1;

        // Register paths
        for (const command of invokeRequests) {
            const { commandPath: path, commandFields, commandRef } = command;
            if (path.endpointId === undefined || path.clusterId === undefined || path.commandId === undefined) {
                if (multipleInvokes) {
                    throw new StatusResponseError(
                        "Wildcard path must not be used with multiple invokes",
                        StatusCode.InvalidAction,
                    );
                }
                this.#processWildcard(path, commandRef, commandFields);
            } else {
                if (Subject.isGroup(this.session.subject)) {
                    // Group command cannot be concrete paths
                    throw new StatusResponseError("Group commands connot be concrete paths", StatusCode.InvalidAction);
                }
                if (multipleInvokes && commandRef === undefined) {
                    throw new StatusResponseError(
                        "The CommandRef field must be specified for all commands in a batch invoke",
                        StatusCode.InvalidAction,
                    );
                }
                this.#processConcrete(path as InvokeResult.ConcreteCommandPath, commandRef, commandFields);
            }
        }

        if (this.#invokers) {
            for (const invoker of this.#invokers) {
                for await (const chunk of invoker.apply(this)) {
                    if (!suppressResponse) {
                        yield chunk;
                    }
                }
            }
        }

        // We emit chunks lazily when the endpoint changes so there may be one remaining chunk.  There may also be a
        // chunk with errors even if there are no data producers
        if (!suppressResponse && this.#chunk !== undefined) {
            yield this.#chunk;
        }
    }

    get counts() {
        return {
            status: this.#statusCount,
            success: this.#successCount,
            existent: this.#successCount + this.#errorCount,
        };
    }

    /**
     * Process a wildcard path and invoke commands on all endpoints that match the path.
     */
    #processWildcard(path: CommandPath, commandRef: number | undefined, commandFields: TlvStream | undefined) {
        const { clusterId, endpointId, commandId } = path;

        // Formally, according to spec, we should check for node mismatch here but commandPath do not have a nodeId

        const isGroupPath = Subject.isGroup(this.session.subject);
        if (isGroupPath && endpointId !== undefined) {
            throw new StatusResponseError(
                "Illegal command invoke with group ID and endpoint ID",
                StatusCode.InvalidAction,
            );
        }

        if (clusterId === undefined || commandId === undefined) {
            throw new StatusResponseError(
                "Wildcard path write must specify a clusterId and commandId",
                StatusCode.InvalidAction,
            );
        }

        let groupEndpoints: EndpointNumber[] | undefined;
        if (isGroupPath) {
            if (this.session.subject.endpoints.length) {
                groupEndpoints = this.session.subject.endpoints;
            } else {
                // No endpoints mapped to this group, so we cannot invoke anything
                logger.debug(`No endpoints mapped to group ${this.session.subject.id}, skipping wildcard invoke`);
                return;
            }
        }

        // If we are here, then endpointId must be wildcard aka undefined
        this.#addInvoker(async function* invokeWildcardEndpoints(this: CommandInvokeResponse) {
            for (const endpoint of this.node) {
                if (groupEndpoints !== undefined && !groupEndpoints.includes(endpoint.id)) {
                    // This endpoint is not part of the group, skip it
                    continue;
                }
                yield* this.#processEndpointForWildcard(endpoint, path, commandRef, commandFields);
            }
        });
    }

    /**
     * Invoke a command specified by a concrete path
     */
    #processConcrete(
        path: InvokeResult.ConcreteCommandPath,
        commandRef: number | undefined,
        commandFields: TlvStream | undefined,
    ) {
        const { endpointId, clusterId, commandId } = path;

        const pathKey = `${endpointId}-${clusterId}-${commandId}`;
        if (this.#registeredPaths.has(pathKey)) {
            throw new StatusResponseError(
                `Duplicate concrete command path ${this.node.inspectPath(path)} on batch invoke`,
                StatusCode.InvalidAction,
            );
        }
        this.#registeredPaths.add(pathKey);
        if (commandRef !== undefined) {
            if (this.#registeredCommandRefs.has(commandRef)) {
                throw new StatusResponseError(
                    `Duplicate commandRef ${commandRef} on batch invoke`,
                    StatusCode.InvalidAction,
                );
            }
            this.#registeredCommandRefs.add(commandRef);
        }

        // Formally, according to spec, we should check for node mismatch here but commandPath do not have a nodeId

        // Resolve path elements
        const endpoint = this.node[endpointId];
        const cluster = endpoint?.[clusterId];
        const command = cluster?.type.commands[commandId];
        let limits;
        if (command === undefined) {
            // We still need to authorize the user for access even though this path doesn't resolve.  Spec is not
            // explicit on what privilege level we should require as normally that information comes from the resolved
            // command.  So attempt to resolve via the active model
            const modelAttr = this.node.matter
                .member(path.clusterId, [ElementTag.Cluster])
                ?.member(path.commandId, [ElementTag.Command]);

            if (modelAttr) {
                // OK cluster doesn't exist at that location, but we do understand semantically, so use limits from the
                // model
                limits = AccessControl(modelAttr as CommandModel).limits;
            } else {
                // We've got no idea.  This effectively falls back to "view" privilege
                limits = FallbackLimits;
            }
        } else {
            limits = command.limits;
        }

        // Validate access.  Order here prescribed by 1.4 core spec 8.4.3.2
        // We need some fallback location if cluster is not defined
        const location = {
            ...(cluster?.location ?? {
                path: DataModelPath.none,
                endpoint: endpointId,
                cluster: clusterId,
            }),
            owningFabric: this.session.fabric,
        };

        if (hasRemoteActor(this.session)) {
            const permission = this.session.authorityAt(limits.writeLevel, location);
            switch (permission) {
                case AccessControl.Authority.Granted:
                    break;

                case AccessControl.Authority.Unauthorized:
                    return this.#addStatus(path, commandRef, Status.UnsupportedAccess);

                case AccessControl.Authority.Restricted:
                    return this.#addStatus(path, commandRef, Status.AccessRestricted);

                default:
                    throw new InternalError(`Unsupported authorization state ${permission}`);
            }
        }

        if (endpoint === undefined) {
            return this.#addStatus(path, commandRef, Status.UnsupportedEndpoint);
        }
        if (cluster === undefined) {
            return this.#addStatus(path, commandRef, Status.UnsupportedCluster);
        }
        if (command === undefined || !cluster.type.commands[command.id]) {
            return this.#addStatus(path, commandRef, Status.UnsupportedCommand);
        }

        if (hasRemoteActor(this.session)) {
            if (limits.fabricScoped && !this.session.fabric) {
                this.#errorCount++;
                return this.#addStatus(path, commandRef, Status.UnsupportedAccess);
            }

            if (limits.timed && !this.session.timed) {
                this.#errorCount++;
                return this.#addStatus(path, commandRef, Status.NeedsTimedInteraction);
            }
        }

        // This path contributes an command value
        this.#addInvoker(async function* invokeConcretePath() {
            // Update internal state for target endpoint
            if (this.#currentEndpoint !== endpoint) {
                if (this.#chunk) {
                    yield this.#chunk;
                    this.#chunk = undefined;
                }
                this.#currentEndpoint = endpoint;
            }

            await this.#invokeCommand(command, path, commandRef, commandFields, cluster.commands[command.id]);
        });
    }

    /**
     * Starts new chunk or adds to current chunk all values from {@link endpoint} selected by {@link path}.
     *
     * Emits previous chunk if it exists and was not for this endpoint.  This means that our chunk size is one endpoint
     * worth of data, except for the initial error chunk if there are path errors.
     **
     * TODO - skip endpoints for which subject is unauthorized as optimization
     */
    async *#processEndpointForWildcard(
        endpoint: EndpointProtocol,
        path: CommandPath,
        commandRef: number | undefined,
        commandFields: TlvStream | undefined,
    ) {
        const { clusterId } = path;

        if (this.#currentEndpoint !== endpoint) {
            if (this.#chunk) {
                yield this.#chunk;
                this.#chunk = undefined;
            }
            this.#currentEndpoint = endpoint;
        }

        const cluster = endpoint[clusterId];
        if (cluster !== undefined) {
            const { commandId } = path;

            const command = cluster.type.commands[commandId];
            if (command !== undefined) {
                if (hasRemoteActor(this.session)) {
                    if (
                        this.session.authorityAt(command.limits.writeLevel, cluster.location) !==
                        AccessControl.Authority.Granted
                    ) {
                        return;
                    }

                    if (command.limits.fabricScoped && !this.session.fabric) {
                        return;
                    }

                    if (command.limits.timed && !this.session.timed) {
                        return;
                    }
                }

                await this.#invokeCommand(
                    command,
                    {
                        ...path,
                        endpointId: endpoint.id,
                    },
                    commandRef,
                    commandFields,
                    cluster.commands[command.id],
                );
            }
        }
    }

    /**
     * Add a function that invokes commands and produces data.  These functions are run after validation of input paths.
     */
    #addInvoker(producer: (this: CommandInvokeResponse) => AsyncIterable<InvokeResult.Chunk>) {
        if (this.#invokers) {
            this.#invokers.push(producer);
        } else {
            this.#invokers = [producer];
        }
    }

    #addResponse(chunk: InvokeResult.Data) {
        if (this.#chunk) {
            this.#chunk.push(chunk);
        } else {
            this.#chunk = [chunk];
        }
    }

    /**
     * Add a status value.
     */
    #addStatus(
        path: InvokeResult.ConcreteCommandPath,
        commandRef: number | undefined,
        status: Status,
        clusterStatus?: number,
    ) {
        if (status !== StatusCode.Success) {
            logger.info(
                () =>
                    `Invoke error ${this.node.inspectPath(path)}: Status=${StatusCode[status]}(${status}), ClusterStatus=${clusterStatus}`,
            );
        }

        const response: InvokeResult.CommandStatus = {
            kind: "cmd-status",
            path,
            status,
            clusterStatus,
            commandRef,
        };

        if (status !== StatusCode.Success) {
            this.#statusCount++;
        }
        this.#addResponse(response);
    }

    async #invokeCommand(
        command: CommandTypeProtocol,
        path: InvokeResult.ConcreteCommandPath,
        commandRef: number | undefined,
        commandFields: TlvStream | undefined,
        invoker: CommandInvokeHandler,
    ) {
        try {
            const { requestTlv, responseTlv } = command;
            const request = this.#decodeWithSchema(requestTlv, commandFields);
            requestTlv.validate(request);
            const response = await invoker(request, this.session);
            await this.session.transaction?.commit();

            this.#successCount++;
            const encodedResponse = responseTlv.encodeTlv(response);
            if (encodedResponse.length === 0) {
                this.#addStatus(path, commandRef, StatusCode.Success);
            } else {
                this.#addResponse({
                    kind: "cmd-response",
                    path: {
                        ...path,
                        commandId: command.responseId,
                    },
                    data: encodedResponse,
                    commandRef,
                });
            }
        } catch (error) {
            await this.session.transaction?.rollback();
            if (StatusResponseError.is(error)) {
                this.#errorCount++;

                let errorCode = error.code;
                const errorLogText = `Error ${Diagnostic.hex(errorCode)}${
                    error.clusterCode !== undefined ? `/${Diagnostic.hex(error.clusterCode)}` : ""
                } while invoking command: ${error.message}`;

                if (error instanceof ValidationError) {
                    logger.info(
                        `Validation-${errorLogText}${error.fieldName !== undefined ? ` in field ${error.fieldName}` : ""}`,
                    );
                    if (errorCode === StatusCode.InvalidAction) {
                        errorCode = StatusCode.InvalidCommand;
                    }
                } else {
                    logger.info(errorLogText);
                }

                this.#addStatus(path, commandRef, errorCode, error.clusterCode);
                return;
            }
            throw error;
        }
    }

    #decodeWithSchema(tlv: TlvSchema<any>, value: TlvStream | undefined) {
        if (value === undefined) {
            return undefined; // The validation will fail if the schema expected data
        }
        return tlv.injectField(
            tlv.decodeTlv(value),
            <number>FabricIndexField.id,
            this.#fabricIndex,
            () => true, // We always inject the current fabricIndex for invokes
        );
    }
}
