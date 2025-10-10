/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { camelize, decamelize, ImplementationError, NotImplementedError } from "#general";
import { CommandModel } from "#model";
import { ApiResource } from "../ApiResource.js";
import { Envelope } from "../Envelope.js";

/**
 * API item for commands.
 */
export class CommandResource extends ApiResource {
    #behavior: Behavior;
    supervisor: ValueSupervisor;

    override readonly isInvocable = true;

    constructor(parent: ApiResource, behavior: Behavior, schema: CommandModel) {
        super(parent);
        this.#behavior = behavior;
        this.supervisor = this.supervisorFor(schema);
    }

    override get schema() {
        return this.supervisor.schema as CommandModel;
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
        let input = new Envelope({ supervisor: this.supervisor, ...request });
        if (input.js === undefined || input.js === null) {
            // The command validator always expects an object even if empty
            input = new Envelope({ supervisor: this.supervisor, js: {} });
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
        input.validate();

        // Invoke
        const result = await method.call(this.#behavior, input.js);

        // If there is no response schema, do not return an envelope
        const responseSchema = this.schema.responseModel;
        if (!responseSchema) {
            return;
        }

        // Create and validate result
        const output = new Envelope({ supervisor: this.supervisorFor(responseSchema), js: result });
        try {
            output.validate();
        } catch (e) {
            // If output validation fails it is an internal error
            const error = new ImplementationError("Command output validation failed");
            error.cause = e;
            throw error;
        }

        // Done
        return output;
    }
}
