/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { Logger, Mutex, Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Agent, Behavior, ClientNode, DesiredStateBehavior, itemMapKey, Node, ServerNode } from "@matter/node";
import { AddNodeToGroup } from "./AddNodeToGroup.js";
import { TaskCancelledSignal, TaskSuspendedSignal } from "./errors.js";
import { Task, TaskPersistence } from "./Task.js";
import { GateControl, TaskContextImpl } from "./TaskContextImpl.js";
import { TaskCtor, TaskRegistry } from "./TaskRegistry.js";
import { TaskState, TaskStatus } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
    "completed",
    "failed",
    "cancelled",
    "cancelFailed",
]);

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
        this.internal.gates = new Map();
        this.#registerBuiltins();
        // Driving acts on the node, so the resume pass must wait until the node is online.
        if (this.#rootNode.lifecycle.isOnline) {
            this.#resumePersisted();
        } else {
            this.reactTo(this.#rootNode.lifecycle.online, this.#resumePersisted);
        }
    }

    #resumePersisted(): void {
        for (const type of new Set(Object.values(this.state.tasks).map(p => p.type))) {
            this.#resumeType(type);
        }
    }

    /** Built-in task types registered before the resume pass. */
    protected registerBuiltins(): void {
        this.internal.registry.register("addNodeToGroup", AddNodeToGroup);
    }

    #registerBuiltins(): void {
        this.registerBuiltins();
    }

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    get #mutex(): Mutex {
        if (this.internal.persistMutex === undefined) {
            this.internal.persistMutex = new Mutex(this);
        }
        return this.internal.persistMutex;
    }

    register(type: string, ctor: TaskCtor): void {
        this.internal.registry.register(type, ctor);
        // Apps register custom task types after construction; resume their persisted, non-terminal tasks now.
        this.#resumeType(type);
    }

    /** Resume persisted, non-terminal, not-yet-live tasks of a registered type. */
    #resumeType(type: string): void {
        if (!this.internal.registry.has(type)) {
            return;
        }
        for (const [id, p] of Object.entries(this.state.tasks)) {
            if (p.type !== type || TERMINAL_STATES.has(p.state) || this.internal.live.has(id)) {
                continue;
            }
            const task = this.internal.registry.create(type, id, p.params, p);
            // A persisted `parked` task must re-drive; #drive only advances `running` tasks, and the phase's
            // gate re-parks from live reachability if the peer is still offline.
            if (task.progress.state === "parked") {
                task.progress.state = "running";
            }
            this.internal.live.set(id, task);
            this.#track(task);
        }
    }

    #track(task: Task): void {
        const drivePromise = this.#drive(task).finally(() => {
            this.internal.driving.delete(task.id);
            this.internal.gates.delete(task.id);
        });
        this.internal.driving.set(task.id, drivePromise);
    }

    run(type: string, params: unknown, opts?: { externalId?: string }): TaskHandle {
        const id = this.internal.registry.idFor(type, params);
        const existing = this.internal.live.get(id);
        if (existing !== undefined) {
            return this.#handle(existing);
        }
        const task = this.internal.registry.create(type, id, params, { externalId: opts?.externalId });
        this.internal.live.set(id, task);
        this.#track(task);
        return this.#handle(task);
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

    /**
     * Cancel a task: stop forward driving and best-effort revert its add-log in reverse order. An offline peer
     * parks the revert (best-effort, not a failure); a terminal revert error yields `cancelFailed`.
     */
    async cancel(idOrExternalId: string): Promise<void> {
        const task = this.#find(idOrExternalId);
        // A completed/running/parked task is still revertible; only an already-cancelled task is a no-op.
        if (task === undefined || task.progress.state === "cancelled" || task.progress.state === "cancelFailed") {
            return;
        }

        // Abort any in-flight gate and wait for forward driving to settle so revert does not race it.
        this.#abortGate(task.id, new TaskCancelledSignal(`Task ${task.id} cancelled`));
        await this.internal.driving.get(task.id);

        // Clear the abort so the revert gate below is not itself short-circuited by the cancel signal.
        this.internal.gates.delete(task.id);
        const ctx = await this.endpoint.act(agent => this.#contextFor(task, this.taskReconciler(agent)));
        try {
            const reverted = new Array<{ peer: ClientNode; kind: string; key: string }>();
            for (const entry of [...task.addLog].reverse()) {
                const peer = this.resolvePeerNode(entry.peerId);
                if (peer === undefined) {
                    continue;
                }
                await ctx.removeIntent(peer, entry.kind, entry.key);
                reverted.push({ peer, kind: entry.kind, key: entry.key });
            }
            const peers = [...new Set(reverted.map(r => r.peer))];
            await ctx.awaitGate(peers, () =>
                reverted.every(
                    r => r.peer.stateOf(DesiredStateBehavior).items[itemMapKey(r.kind, r.key)] === undefined,
                ),
            );
            task.progress.state = "cancelled";
            task.error = undefined;
        } catch (e) {
            task.progress.state = "cancelFailed";
            task.error = e instanceof Error ? e.message : String(e);
            logger.error(`Task ${task.id}: cancel revert failed`, e);
        }
        this.internal.gates.delete(task.id);
        await this.#persist(task);
    }

    #abortGate(id: string, reason: unknown): void {
        const gate = this.internal.gates.get(id);
        if (gate === undefined) {
            return;
        }
        gate.aborted = reason;
        gate.wake.emit();
    }

    async #drive(task: Task): Promise<void> {
        try {
            // Persist before first phase so a crash-resume sees the task.
            await this.#persist(task);
            while (task.progress.phaseIndex < task.phases.length && task.progress.state === "running") {
                const phase = task.phases[task.progress.phaseIndex];
                const ctx = await this.endpoint.act(agent => this.#contextFor(task, this.taskReconciler(agent)));
                await phase.run(ctx);
                task.progress.phaseIndex += 1;
                await this.#persist(task);
            }
            if (task.progress.state === "running") {
                task.progress.state = "completed";
                await this.#persist(task);
            }
        } catch (e) {
            // Shutdown leaves the task non-terminal for resume; cancel is finalized by cancel() itself.
            if (e instanceof TaskSuspendedSignal || e instanceof TaskCancelledSignal) {
                return;
            }
            task.progress.state = "failed";
            task.error = e instanceof Error ? e.message : String(e);
            logger.error(`Task ${task.id} failed`, e);
            // A failing persist here must not re-reject the (otherwise handled) drive promise.
            try {
                await this.#persist(task);
            } catch (persistError) {
                logger.error(`Task ${task.id}: failed to persist failure state`, persistError);
            }
        }
    }

    #contextFor(task: Task, reconciler: ReconcilerBehavior): TaskContextImpl {
        const setState = (state: TaskState) => {
            // Terminal states are owned by #drive; gates only flip between running/parked.
            if (
                task.progress.state === state ||
                (task.progress.state !== "running" && task.progress.state !== "parked")
            ) {
                return;
            }
            task.progress.state = state;
            this.#mutex.run(() => this.#persist(task));
        };
        return new TaskContextImpl(task, id => this.resolvePeerNode(id), reconciler, setState, this.#gateFor(task.id));
    }

    /** Per-task gate control: cancel/shutdown set `aborted`; `onAbort` wakes a parked gate to observe it. */
    #gateFor(id: string): GateControl {
        let gate = this.internal.gates.get(id);
        if (gate === undefined) {
            gate = { wake: new Observable() };
            this.internal.gates.set(id, gate);
        }
        return {
            aborted: () => gate.aborted,
            onAbort: wake => {
                gate.wake.on(wake);
                return () => gate.wake.off(wake);
            },
        };
    }

    /** The reconciler a task's gates use. Overridable for testing without a commissioned fabric. */
    protected taskReconciler(agent: Agent): ReconcilerBehavior {
        return agent.get(ReconcilerBehavior);
    }

    /** Resolve a peer by id for gates and cancel-revert. Overridable for testing. */
    protected resolvePeerNode(peerId: string): ClientNode | undefined {
        return this.#rootNode.peers.get(peerId);
    }

    async #persist(task: Task): Promise<void> {
        const record = task.toPersistence();
        await this.endpoint.act(agent => {
            const self = agent.get(TaskManagerBehavior);
            self.state.tasks = { ...self.state.tasks, [task.id]: record };
        });
    }

    override async [Symbol.asyncDispose]() {
        // Suspend in-flight gates so parked tasks stop cleanly (non-terminal, resumable) instead of hanging close.
        for (const id of this.internal.gates.keys()) {
            this.#abortGate(id, new TaskSuspendedSignal(`Task ${id} suspended on shutdown`));
        }
        await Promise.allSettled([...this.internal.driving.values()]);
        await this.internal.persistMutex?.close();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace TaskManagerBehavior {
    export class State {
        tasks: Record<string, TaskPersistence> = {};
    }

    export interface GateState {
        aborted?: unknown;
        wake: Observable<[]>;
    }

    export class Internal {
        registry!: TaskRegistry;
        live!: Map<string, Task>;
        gates!: Map<string, GateState>;
        driving = new Map<string, Promise<void>>();
        persistMutex?: Mutex;
    }

    export class Events extends Behavior.Events {}
}
