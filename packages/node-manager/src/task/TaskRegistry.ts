/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { NOT_REVERTIBLE_REASON, RunView, Task, TaskDefinition, TaskPersistence } from "./Task.js";
import { PlannedChange, RunId } from "./types.js";

export class TaskRegistry {
    #definitions = new Map<string, TaskDefinition<unknown>>();

    /**
     * Definitions are stored type-erased. Their members are declared as methods, whose parameters TypeScript
     * treats bivariantly, so a definition for concrete params is assignable here without a cast.
     */
    register<P>(definition: TaskDefinition<P>): void {
        this.#definitions.set(definition.type, definition);
    }

    has(type: string): boolean {
        return this.#definitions.has(type);
    }

    slotKeyFor(type: string, params: unknown): string {
        return this.#definitionFor(type).slotKeyFor(params);
    }

    undoes(type: string, params: unknown): RunId | undefined {
        return this.#definitionFor(type).undoes?.(params);
    }

    callerCreatable(type: string): boolean {
        return this.#definitionFor(type).callerCreatable ?? true;
    }

    plannedChanges(type: string, params: unknown): PlannedChange[] {
        return this.#definitionFor(type).plannedChanges?.(params) ?? new Array<PlannedChange>();
    }

    /**
     * Whether a stored record may still be rolled back.
     *
     * Only for a run this process is not running: a live run answers from the definition it was built with, so
     * a definition registered since cannot overrule it.
     */
    revertible(run: RunView, params: unknown): boolean {
        return this.#definitionFor(run.type).revertible?.(run, params) ?? true;
    }

    notRevertibleReason(type: string): string {
        return this.#definitionFor(type).notRevertibleReason ?? NOT_REVERTIBLE_REASON;
    }

    create(type: string, runId: RunId, slotKey: string, params: unknown, persisted?: Partial<TaskPersistence>): Task {
        return new Task(this.#definitionFor(type), runId, slotKey, params, persisted);
    }

    #definitionFor(type: string): TaskDefinition<unknown> {
        const definition = this.#definitions.get(type);
        if (definition === undefined) {
            throw new ImplementationError(`No task registered for type "${type}"`);
        }
        return definition;
    }
}
