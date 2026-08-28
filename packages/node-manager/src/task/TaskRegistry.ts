/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { Task, TaskPersistence } from "./Task.js";
import { RunId } from "./types.js";

export interface TaskCtor {
    new (runId: RunId, slotKey: string, params: any, persisted?: Partial<TaskPersistence>): Task;
    slotKeyFor(params: any): string;
}

export class TaskRegistry {
    #ctors = new Map<string, TaskCtor>();

    register(type: string, ctor: TaskCtor): void {
        this.#ctors.set(type, ctor);
    }

    has(type: string): boolean {
        return this.#ctors.has(type);
    }

    slotKeyFor(type: string, params: unknown): string {
        return this.#ctorFor(type).slotKeyFor(params);
    }

    create(type: string, runId: RunId, slotKey: string, params: unknown, persisted?: Partial<TaskPersistence>): Task {
        return new (this.#ctorFor(type))(runId, slotKey, params, persisted);
    }

    #ctorFor(type: string): TaskCtor {
        const ctor = this.#ctors.get(type);
        if (ctor === undefined) {
            throw new ImplementationError(`No task registered for type "${type}"`);
        }
        return ctor;
    }
}
