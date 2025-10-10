/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppAddress,
    asError,
    Bytes,
    Diagnostic,
    HttpEndpoint,
    HttpService,
    InternalError,
    Logger,
    MatterError,
    NotImplementedError,
    Stream,
} from "#general";
import { StatusResponse, StatusResponseError } from "#types";
import { Api } from "../remote/api/Api.js";
import { ApiPath } from "../remote/api/ApiPath.js";
import { ApiResource } from "../remote/api/ApiResource.js";
import { Envelope } from "../remote/api/Envelope.js";
import { LocalResponse } from "../remote/api/LocalResponse.js";
import { RemoteInterface } from "../remote/RemoteInterface.js";

const logger = Logger.get("HttpInterface");

/**
 * HTTP remote interface.
 */
export class HttpInterface extends RemoteInterface {
    static override protocol = "http";
    #http?: HttpEndpoint;

    protected override async start() {
        this.#http = await this.env.get(HttpService).create(this.address);
        this.#http.http = this.#handleRequest.bind(this);
    }

    protected override async stop() {
        await this.#http?.close();
    }

    async #handleRequest(request: Request) {
        let response: Response;

        try {
            const address = new AppAddress(request.url);
            const path = this.root.subpathFor(new ApiPath(address));
            if (!path) {
                return;
            }

            response = await this.node.act("http", async agent => {
                const resource = await Api.resourceFor(agent, path);
                if (resource === undefined) {
                    throw new StatusResponse.NotFoundError(`Path "${address.pathname}" not found`);
                }

                return this.#applyRequestToItem(request, resource);
            });

            logSuccess(request, response);

            return response;
        } catch (e) {
            const response = adaptError(e);

            logError(request, response, e);

            return response;
        }
    }

    async #applyRequestToItem(request: Request, item: ApiResource) {
        switch (request.method) {
            case "GET": {
                const responseEnv = item.read();
                if (responseEnv === undefined) {
                    throw new NotImplementedError();
                }
                return adaptResponse(request, responseEnv);
            }

            case "POST": {
                const requestEnv = await adaptRequest(request);

                if (item.isInvocable) {
                    const responseEnv = await item.invoke(requestEnv);
                    if (responseEnv === undefined) {
                        return ok();
                    }
                    return adaptResponse(request, responseEnv);
                }

                if (item.isSubscribable) {
                    return adaptResponse(request, item.subscribe(this.abort, requestEnv));
                }

                await item.add(requestEnv);
                return ok();
            }

            case "PUT": {
                const requestPayload = await adaptRequest(request);
                item.write(requestPayload);
                return ok();
            }

            case "PATCH": {
                const requestPayload = await adaptRequest(request);
                item.write(requestPayload);
                return ok();
            }

            case "DELETE":
                await item.delete();
                break;
        }

        throw new NotImplementedError();
    }
}

export class UnnacceptableError extends MatterError {}
export class UnsupportedRequestContentTypeError extends MatterError {}

// A bit half-assed but 4xx vs 5xx is the important thing; put in more effort if necessary
const ErrorMappings: [new (...args: any[]) => Error, HttpStatusCode][] = [
    [StatusResponse.UnsupportedAccessError, 401],
    [StatusResponse.NotFoundError, 404],
    [NotImplementedError, 405],
    [UnnacceptableError, 406],
    [UnsupportedRequestContentTypeError, 415],
];

const StatusCode = {
    200: "OK",
    400: "Bad Request",
    401: "Unauthorized",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Unnacceptable",
    415: "Unsupported Media Type",
    500: "Internal Server Error",
};

export type HttpStatusCode = keyof typeof StatusCode;

export const JSON_CONTENT_TYPE = "application/json";
export const JSONL_CONTENT_TYPE = "application/jsonl";
export const TLV_CONTENT_TYPE = "application/matter-tlv";

async function adaptRequest(request: Request): Promise<Envelope.Data> {
    let contentType = request.headers.get("Content-Type");
    if (contentType) {
        contentType = contentType.split(";")[0].trim();
    } else {
        contentType = "application/json";
    }

    switch (contentType) {
        case JSON_CONTENT_TYPE:
            return { json: await request.text() };

        case TLV_CONTENT_TYPE:
            return { tlv: await request.bytes() };

        default:
            throw new UnsupportedRequestContentTypeError();
    }
}

function ok() {
    return new Response(null, {
        status: 200,
        statusText: StatusCode[200],
    });
}

function adaptResponse(request: Request, response: Envelope | LocalResponse.Stream) {
    const streamingResponse = Symbol.asyncIterator in response;

    const accept = request.headers.get("Accept-Encoding");

    const encodings = accept?.split(",").map(encoding => encoding.split(";")[0].trim());

    let contentType;
    if (encodings) {
        for (const encoding of encodings) {
            if (encoding === JSONL_CONTENT_TYPE) {
                if (streamingResponse) {
                    contentType = encoding;
                } else {
                    contentType = JSON_CONTENT_TYPE;
                }
                break;
            }

            if ((!streamingResponse && encoding === JSON_CONTENT_TYPE) || encoding === TLV_CONTENT_TYPE) {
                contentType = encoding;
                break;
            }
        }

        if (contentType === undefined) {
            throw new UnnacceptableError(`Cannot produce requested MIME type "${accept}"`);
        }
    } else if (streamingResponse) {
        contentType = JSONL_CONTENT_TYPE;
    } else {
        contentType = JSON_CONTENT_TYPE;
    }

    let body: BodyInit;
    if (streamingResponse) {
        // Streaming body
        body = Stream.from(EnvelopeStreamIterator(contentType, response));
    } else if (contentType === TLV_CONTENT_TYPE) {
        // Body encoded as TLV
        body = Bytes.exclusive(response.tlv);
    } else {
        // Body encoded as JSON
        body = response.json;
    }

    return new Response(
        body,

        {
            status: 200,
            statusText: StatusCode[200],
            headers: {
                "Content-Type": contentType,
            },
        },
    );
}

function adaptError(e: unknown) {
    const error = asError(e);

    let status: number | undefined;
    for (const [type, typeStatus] of ErrorMappings) {
        if (error instanceof type) {
            status = typeStatus;
        }
    }

    if (status === undefined) {
        if (e instanceof StatusResponseError) {
            status = 400;
        } else {
            status = 500;
        }
    }

    let code, message;
    if (status >= 400 && status < 500) {
        code = (error as MatterError).id ?? "unknown";
        message = (error as StatusResponseError).bareMessage ?? error.message;
    } else {
        code = "internal";
        message = "Internal error";
    }

    return new Response(
        JSON.stringify({
            kind: "error",
            code,
            message,
        }),

        {
            status: status,
            statusText: (StatusCode as Record<number, string>)[status] ?? "Error",
            headers: {
                "Content-Type": JSON_CONTENT_TYPE,
                "Error-Code": code,
            },
        },
    );
}

function logSuccess(request: Request, response: Response) {
    logger.notice(diagnosticHeaderFor(request, response));
}

function logError(request: Request, response: Response, error: unknown) {
    if (response.status >= 500 && response.status < 600) {
        logger.error(diagnosticHeaderFor(request, response), error);
    } else if (error instanceof MatterError) {
        logger.error(
            diagnosticHeaderFor(request, response),
            Diagnostic.squash("[", Diagnostic.strong(error.id), "]"),
            error.message,
        );
    } else {
        logger.warn(diagnosticHeaderFor(request, response), asError(error).message);
    }
}

function diagnosticHeaderFor(request: Request, response: Response) {
    return Diagnostic.squash("[", Diagnostic.strong(request.url), " ", request.method, " ", response.status, "]");
}

async function* EnvelopeStreamIterator(contentType: string, iterator: AsyncIterable<Envelope, void, void>) {
    switch (contentType) {
        case TLV_CONTENT_TYPE:
            for await (const envelope of iterator) {
                yield envelope.tlv;
            }
            break;

        case JSONL_CONTENT_TYPE:
            for await (const envelope of iterator) {
                yield `${envelope.json}\n`;
            }
            break;

        default:
            throw new InternalError(`Unsupported streaming content type ${contentType}`);
    }
}
