/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, InternalError } from "#general";
import { StateStream } from "#node/integration/StateStream.js";
import { ServerNode } from "#node/ServerNode.js";
import { ApiResource } from "../ApiResource.js";
import { Envelope } from "../Envelope.js";
import { LocalResponse } from "../LocalResponse.js";
import { NodeResource as ServerNodeItem } from "./NodeResource.js";

/**
 * An item that delivers state changes via subscription.
 */
export class ChangesResource extends ApiResource {
    readonly id = "changes";
    readonly valueKind = "changes";
    readonly schema = undefined;
    readonly value = undefined;
    override readonly isSubscribable = true;

    declare readonly parent: ServerNodeItem;

    constructor(parent: ServerNodeItem) {
        super(parent);
    }

    get dataModelPath() {
        return this.parent.dataModelPath.at("changes");
    }

    override async *subscribe(
        abort: Abort.Signal,
        request: Envelope.Data,
    ): AsyncGenerator<Envelope<LocalResponse>, void, void> {
        const requestEnv = new Envelope({ schema: StateStream.OptionsSchema, ...request });

        let options: undefined | StateStream.Options;
        if (requestEnv.js) {
            requestEnv.validate();
            options = requestEnv.js as StateStream.Options;
        }

        const stream = StateStream(this.parent.node as ServerNode, { ...options, abort });

        const { id } = request;

        for await (const change of stream) {
            const wire = StateStream.WireChange(change);

            switch (change.kind) {
                case "update":
                    yield new Envelope({ schema: StateStream.WireUpdateSchema, js: { id, ...wire } });
                    break;

                case "delete":
                    yield new Envelope({ schema: StateStream.WireDeleteSchema, js: { id, ...wire } });
                    break;

                default:
                    throw new InternalError(`Unsupported change kind ${(change as StateStream.Change).kind}`);
            }
        }
    }
}
