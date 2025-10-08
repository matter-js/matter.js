/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { camelize, decamelize, ImplementationError, NotImplementedError } from "#general";
import { CommandModel } from "#model";
import { ApiResource } from "../ApiResource.js";
import { Envelope } from "../Envelope.js";

/**
 * API item for commands.
 */
export class CommandResource extends ApiResource {
    #behavior: Behavior;
    schema: CommandModel;

    override readonly isInvocable = true;

    constructor(parent: ApiResource, behavior: Behavior, schema: CommandModel) {
        super(parent);
        this.#behavior = behavior;
        this.schema = schema;
    }

    get id() {
        return decamelize(this.schema.name);
    }

    get dataModelPath() {
        return this.parent!.dataModelPath.at(this.id);
    }

    override get valueKind(): ApiResource.Kind {
        return "command";
    }

    get value() {
        return undefined;
    }

    override async invoke(request?: Envelope.Data) {
        let payload = new Envelope({ schema: this.schema, ...request }).js;
        if (payload === undefined || payload === null) {
            // The command validator always expects an object even if empty
            payload = {};
        }

        // Method must exist on behavior or we cannot invoke
        const name = camelize(this.id);
        const method = (this.#behavior as unknown as Record<string, undefined | ((...args: unknown[]) => unknown)>)[
            name
        ];
        if (typeof method !== "function") {
            throw new NotImplementedError();
        }

        // Validate input
        const inputSupervisor = RootSupervisor.for(this.schema);
        inputSupervisor.validate?.(payload, this.#behavior.agent.context, { path: this.dataModelPath });

        // Invoke
        const result = await method.call(this.#behavior, payload);

        // Validate output
        const responseSchema = this.schema.responseModel;
        if (responseSchema) {
            const outputSupervisor = RootSupervisor.for(responseSchema);
            try {
                outputSupervisor.validate?.(payload, this.#behavior.agent.context, { path: this.dataModelPath });
            } catch (e) {
                const error = new ImplementationError("Command output validation failed");
                error.cause = e;
                throw error;
            }
        }

        // Done
        if (result === undefined) {
            return;
        }
        return new Envelope({ schema: this.schema, js: result });
    }
}
