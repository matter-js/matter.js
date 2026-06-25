/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { Task, TaskPersistence } from "./Task.js";

export interface TaskCtor {
    new (id: string, params: any, persisted?: Partial<TaskPersistence>): Task;
    idFor(params: any): string;
}

export class TaskRegistry {
    #ctors = new Map<string, TaskCtor>();

    register(type: string, ctor: TaskCtor): void {
        this.#ctors.set(type, ctor);
    }

    idFor(type: string, params: unknown): string {
        return this.#ctorFor(type).idFor(params);
    }

    create(type: string, id: string, params: unknown, persisted?: Partial<TaskPersistence>): Task {
        return new (this.#ctorFor(type))(id, params, persisted);
    }

    #ctorFor(type: string): TaskCtor {
        const ctor = this.#ctors.get(type);
        if (ctor === undefined) {
            throw new ImplementationError(`No task registered for type "${type}"`);
        }
        return ctor;
    }
}
