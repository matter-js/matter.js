/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "#endpoint/Agent.js";
import { Abort, asError, Diagnostic, InternalError, Logger } from "#general";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { StatusResponse, StatusResponseError } from "#types";
import { ApiPath } from "./ApiPath.js";
import { ApiResource } from "./ApiResource.js";
import { LocalResponse } from "./LocalResponse.js";
import { RemoteRequest } from "./RemoteRequest.js";
import { RemoteResponse } from "./RemoteResponse.js";
import { EndpointResource } from "./resources/EndpointResource.js";
import { NodeResource } from "./resources/NodeResource.js";
import { ServerNodeResource } from "./resources/ServerNodeResource.js";

const loggers = new Map<string, Logger>();

/**
 * Common substrate for the network APIs.
 *
 * The logical API covers RPC and read/write semantics.  These involve a "/"-separated path and a logical operation
 * (read, write, invoke, etc.)
 *
 * This namespace provides utilities for mapping paths to resources and taking action on the resource.
 */
export namespace Api {
    /**
     * Retrieve the {@link ApiResource} for a path.
     */
    export async function resourceFor(agent: Agent, path: ApiPath): Promise<ApiResource | void> {
        let item;
        if ("peers" in agent.endpoint) {
            item = new ServerNodeResource(agent, undefined);
        } else if (agent.endpoint instanceof Node) {
            item = new NodeResource(agent, undefined);
        } else {
            item = new EndpointResource(agent, undefined);
        }

        const breadcrumb: ApiResource[] = [item];

        for (const segment of path) {
            const parent = breadcrumb[breadcrumb.length - 1];

            const item = await parent.childFor(segment);
            if (!item) {
                return;
            }

            breadcrumb.push(item);
        }

        return breadcrumb[breadcrumb.length - 1];
    }

    export function log(level: "error" | "info", facility: string, id: string | undefined, ...message: unknown[]) {
        let logger = loggers.get(facility);
        if (!logger) {
            loggers.set(facility, (logger = Logger.get(facility)));
        }
        logger[level](Diagnostic.via(id ?? "(anon)"), message);
    }

    export function logRequest(facility: string, id: string | undefined, method: string, target: string) {
        log("info", facility, id, "«", Diagnostic.strong(method), target);
    }

    export function logResponse(facility: string, response: RemoteResponse) {
        const message = Array<unknown>("»", RemoteResponse.describe(response));
        let level: "error" | "info";
        switch (response.kind) {
            case "error":
                message.push(Diagnostic.errorMessage({ id: response.code, message: response.message }));
                level = "error";
                break;

            default:
                level = "info";
                break;
        }
        log(level, facility, response.id, message);
    }

    /**
     * Execute a {@link RemoteRequest}.
     */
    export async function execute(
        facility: string,
        node: ServerNode,
        request: RemoteRequest,
        signal: Abort.Signal,
    ): Promise<LocalResponse> {
        const { target, method, id } = request;

        logRequest(facility, id, method, target);

        try {
            const message = await node.act("remote", async (agent): Promise<LocalResponse> => {
                const item = await resourceFor(agent, new ApiPath(target));
                if (item === undefined) {
                    throw new StatusResponse.NotFoundError(`Target "${target}" not found`);
                }

                switch (method) {
                    case "read":
                        const value = item.read();
                        if (value === undefined) {
                            throw new StatusResponse.UnsupportedReadError(`Target "${target}" is not readable`);
                        }
                        value.convertToJson();

                        return {
                            kind: "value",
                            id,

                            // TODO - consider handling serialization here (in agent context) so copy is unnecessary
                            value,
                        };

                    case "write":
                        item.write({ js: request.value });
                        return { kind: "ok", id };

                    case "add":
                        item.add({ js: item.value });
                        return { kind: "ok", id };

                    case "delete":
                        item.delete();
                        return { kind: "ok", id };

                    case "invoke": {
                        const value = await item.invoke({ js: request.parameters });
                        if (value?.js === undefined || value?.js === null) {
                            return { kind: "ok", id };
                        }
                        value.convertToJson();
                        return { id, kind: "value", value };
                    }

                    case "subscribe": {
                        const options = { ...request } as Record<string, unknown>;
                        for (const field of ["target", "id", "method"]) {
                            delete options[field];
                        }
                        const stream = item.subscribe(signal, {
                            id,
                            js: options,
                        });
                        return { kind: "subscription", id, stream };
                    }
                }
            });

            return message;
        } catch (error) {
            return errorResponseOf(facility, id, error);
        }
    }

    export function errorResponseOf(facility: string, id: string | undefined, error: unknown): LocalResponse {
        error = asError(error);

        // User-facing message
        if (error instanceof StatusResponseError) {
            return { kind: "error", id, error };
        }

        // Internal error
        log("error", facility, id, "Internal error:", error);
        return { kind: "error", id, error: new InternalError() };
    }
}
