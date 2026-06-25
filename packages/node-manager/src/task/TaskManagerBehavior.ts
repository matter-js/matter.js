/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { Logger } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Behavior, Node, ServerNode } from "@matter/node";
import { Task, TaskPersistence } from "./Task.js";
import { TaskContextImpl } from "./TaskContextImpl.js";
import { TaskCtor, TaskRegistry } from "./TaskRegistry.js";
import { TaskStatus } from "./types.js";

const logger = Logger.get("TaskManager");

export interface TaskHandle {
    readonly id: string;
    readonly status: TaskStatus;
}

export class TaskManagerBehavior extends Behavior {
    static override readonly id = "taskManager";
    static override readonly early = true;

    declare readonly state: TaskManagerBehavior.State;
    declare internal: TaskManagerBehavior.Internal;

    static override readonly schema = new DatatypeModel({
        name: "TaskManager",
        type: "struct",
        children: [
            FieldElement({
                name: "tasks",
                type: "any",
                quality: "N",
                default: { type: "properties", properties: {} },
            }),
        ],
    });

    override async initialize() {
        this.endpoint.behaviors.require(ReconcilerBehavior);
        this.internal.registry = new TaskRegistry();
        this.internal.live = new Map();
        // Resume from persisted tasks implemented in Task 3.
    }

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    register(type: string, ctor: TaskCtor): void {
        this.internal.registry.register(type, ctor);
    }

    run(type: string, params: unknown, opts?: { externalId?: string }): Promise<TaskHandle> {
        const id = this.internal.registry.idFor(type, params);
        const existing = this.internal.live.get(id);
        if (existing !== undefined) {
            // Already running or finished; return current handle. The task's act transaction is independent of ours.
            return Promise.resolve(this.#handle(existing));
        }
        const task = this.internal.registry.create(type, id, params, { externalId: opts?.externalId });
        this.internal.live.set(id, task);
        // T1 (caller's act) stays Shared and never writes state.tasks; T2 (each #persist act) can independently
        // acquire the tasks resource lock without conflict. Returning the drive promise lets callers await completion.
        const drivePromise = this.#drive(task);
        this.internal.driving.set(id, drivePromise);
        return drivePromise.then(
            () => this.#handle(task),
            () => this.#handle(task),
        );
    }

    get(idOrExternalId: string): TaskHandle | undefined {
        const task = this.#find(idOrExternalId);
        return task && this.#handle(task);
    }

    get tasks(): TaskHandle[] {
        return [...this.internal.live.values()].map(t => this.#handle(t));
    }

    #find(idOrExternalId: string): Task | undefined {
        const byId = this.internal.live.get(idOrExternalId);
        if (byId !== undefined) {
            return byId;
        }
        for (const t of this.internal.live.values()) {
            if (t.externalId === idOrExternalId) {
                return t;
            }
        }
        return undefined;
    }

    #handle(task: Task): TaskHandle {
        return { id: task.id, status: task.status };
    }

    async #drive(task: Task): Promise<void> {
        try {
            // Persist before first phase so a crash-resume sees the task.
            await this.#persist(task);
            while (task.progress.phaseIndex < task.phases.length && task.progress.state === "running") {
                const phase = task.phases[task.progress.phaseIndex];
                const ctx = new TaskContextImpl(task, this.#rootNode);
                await phase.run(ctx);
                task.progress.phaseIndex += 1;
                await this.#persist(task);
            }
            if (task.progress.state === "running") {
                task.progress.state = "completed";
                await this.#persist(task);
            }
        } catch (e) {
            task.progress.state = "failed";
            task.error = e instanceof Error ? e.message : String(e);
            await this.#persist(task);
            logger.error(`Task ${task.id} failed`, e);
        }
    }

    async #persist(task: Task): Promise<void> {
        const record = task.toPersistence();
        await this.endpoint.act(agent => {
            const self = agent.get(TaskManagerBehavior);
            self.state.tasks = { ...self.state.tasks, [task.id]: record };
        });
    }

    override async [Symbol.asyncDispose]() {
        await Promise.allSettled([...this.internal.driving.values()]);
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace TaskManagerBehavior {
    export class State {
        tasks: Record<string, TaskPersistence> = {};
    }

    export class Internal {
        registry!: TaskRegistry;
        live!: Map<string, Task>;
        driving = new Map<string, Promise<void>>();
    }

    export class Events extends Behavior.Events {}
}
