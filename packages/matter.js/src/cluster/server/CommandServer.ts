/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#device/Endpoint.js";
import { Diagnostic, Logger } from "#general";
import { AccessLevel, FabricIndex } from "#model";
import { Message, SecureSession, Session } from "#protocol";
import { CommandId, StatusCode, TlvSchema, TlvStream } from "#types";

const logger = Logger.get("CommandServer");

export class CommandServer<RequestT = any, ResponseT = any> {
    readonly #invokeAcl: AccessLevel;

    constructor(
        readonly invokeId: CommandId,
        readonly responseId: CommandId,
        readonly name: string,
        readonly requestSchema: TlvSchema<RequestT>,
        readonly responseSchema: TlvSchema<ResponseT>,
        readonly requiresTimedInteraction: boolean,
        invokeAcl: AccessLevel,
        protected readonly handler: (
            request: RequestT,
            session: Session,
            message: Message,
            endpoint: Endpoint,
        ) => Promise<ResponseT> | ResponseT,
    ) {
        this.#invokeAcl = invokeAcl;
    }

    async invoke(
        session: Session,
        args: TlvStream,
        message: Message,
        endpoint: Endpoint,
    ): Promise<{
        /** Primary StatusCode of the invoke request  as defined by Interaction proptocol. */
        code: StatusCode;

        /** Cluster specific StatusCode of the invoke request if required */
        clusterCode?: number;

        /** ID of the response */
        responseId: CommandId;

        /** Response data */
        response: TlvStream;
    }> {
        let request = this.requestSchema.decodeTlv(args);

        // Inject fabric index into structures in general if undefined, if set it will be used
        if (session.isSecure) {
            const fabric = (session as SecureSession).fabric;
            if (fabric) {
                request = this.requestSchema.injectField(
                    request,
                    <number>FabricIndex.id,
                    session.associatedFabric.fabricIndex,
                    () => true, // Noone should send any index and if we simply SHALL ignore it
                );
            }
        }

        this.requestSchema.validate(request);
        this.debug(`Invoke ${this.name} with data ${Diagnostic.json(request)}`);
        const response = await this.handler(request, session, message, endpoint);
        this.debug(`Invoke ${this.name} response : ${Diagnostic.json(response)}`);
        return {
            code: StatusCode.Success,
            responseId: this.responseId,
            response: this.responseSchema.encodeTlv(response),
        };
    }

    debug(message: string) {
        logger.debug(message);
    }

    get invokeAcl() {
        return this.#invokeAcl ?? AccessLevel.Operate; // or View?? Re "Read/Invoke" in Access table
    }
}
