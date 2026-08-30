/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { BoundDefinition, TaskDefinition } from "./Task.js";

export class TaskRegistry {
    #definitions = new Map<string, TaskDefinition<unknown>>();

    /**
     * Definitions are stored type-erased. Their members are declared as methods, whose parameters TypeScript
     * treats bivariantly, so a definition for concrete params is assignable here without a cast — and so the
     * compiler cannot object to untyped params reaching them either. {@link interpret} is the only way out of
     * this map for that reason.
     */
    register<P>(definition: TaskDefinition<P>): void {
        this.#definitions.set(definition.type, definition);
    }

    has(type: string): boolean {
        return this.#definitions.has(type);
    }

    /**
     * Bind stored params to the definition registered for their type, refusing params it cannot interpret.
     *
     * The one way a record's untyped params reach a definition. Everything a definition is asked about a run is
     * asked of the result, so no caller can route around the check by holding the params itself.
     */
    interpret(type: string, params: unknown): BoundDefinition {
        const definition = this.#definitions.get(type);
        if (definition === undefined) {
            throw new ImplementationError(`No task registered for type "${type}"`);
        }
        return new BoundDefinition(definition, params);
    }
}
