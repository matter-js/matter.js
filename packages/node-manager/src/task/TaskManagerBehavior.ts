/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { Logger, Mutex, Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Agent, Behavior, ClientNode, DesiredStateBehavior, itemMapKey, Node, ServerNode } from "@matter/node";
import { TaskCancelledSignal, TaskCapacityExceededError, TaskSuspendedSignal } from "./errors.js";
import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroup } from "./groups/AddNodeToGroup.js";
import { Revert, REVERT_TYPE } from "./Revert.js";
import { GateControl, RunningTaskContext } from "./RunningTaskContext.js";
import { Task, TaskPersistence } from "./Task.js";
import { TaskCtor, TaskRegistry } from "./TaskRegistry.js";
import { PlannedChange, TaskState, TaskStatus } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(["completed", "failed", "cancelled"]);

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
        this.internal.registry.register(ADD_NODE_TO_GROUP_TYPE, AddNodeToGroup);
        this.internal.registry.register(REVERT_TYPE, Revert);
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
     * Cancel a task: stop forward driving, then spawn a revert task that rolls back the changeSet as an ordinary
     * task (parks on offline peers, resumes after restart). Returns the revert handle, or `undefined` if there
     * was nothing to revert. Does not await the revert — the caller observes it via the returned handle.
     */
    async cancel(idOrExternalId: string): Promise<TaskHandle | undefined> {
        const task = this.#find(idOrExternalId);
        if (task === undefined || task.progress.state === "cancelled") {
            return task?.revertTaskId === undefined ? undefined : this.get(task.revertTaskId);
        }

        // Stop forward driving so the changeset is final before we revert it.
        this.#abortGate(task.id, new TaskCancelledSignal(`Task ${task.id} cancelled`));
        await this.internal.driving.get(task.id);
        this.internal.gates.delete(task.id);

        // running/parked → cancelled; an already-terminal (completed/failed) task keeps its truthful state.
        if (task.progress.state === "running" || task.progress.state === "parked") {
            task.progress.state = "cancelled";
        }
        const handle = this.#spawnRevert(task);
        await this.#persist(task);
        return handle;
    }

    /** Spawn (or reuse) the revert task for `task`, linking both directions. Returns undefined if no changeSet. */
    #spawnRevert(task: Task): TaskHandle | undefined {
        // A failed revert surfaces as `failed` for operator attention; reverting a revert would recurse unbounded.
        if (task.type === REVERT_TYPE) {
            return undefined;
        }
        if (task.revertTaskId !== undefined) {
            return this.get(task.revertTaskId);
        }
        if (task.changeSet.length === 0) {
            return undefined;
        }
        const handle = this.run(REVERT_TYPE, { originalId: task.id, entries: task.changeSet });
        const revert = this.internal.live.get(handle.id);
        if (revert !== undefined) {
            revert.revertOf = task.id;
        }
        task.revertTaskId = handle.id;
        return handle;
    }

    #abortGate(id: string, reason: unknown): void {
        const gate = this.internal.gates.get(id);
        if (gate === undefined) {
            return;
        }
        gate.aborted = reason;
        gate.wake.emit();
    }

    /**
     * Reject a task before any node mutation if its planned changes would overflow a target's device capacity.
     * Runs before the first persist/phase; the thrown error ends the task `failed` with an empty changeSet.
     */
    async #admit(task: Task): Promise<void> {
        const planned = task.plannedChanges();
        if (planned.length === 0) {
            return;
        }
        const byNodeKind = new Map<string, PlannedChange[]>();
        for (const pc of planned) {
            const k = `${pc.peerId}\0${pc.kind}`;
            let group = byNodeKind.get(k);
            if (group === undefined) {
                group = new Array<PlannedChange>();
                byNodeKind.set(k, group);
            }
            group.push(pc);
        }
        for (const group of byNodeKind.values()) {
            const { peerId, kind } = group[0];
            const peer = this.resolvePeerNode(peerId);
            if (peer === undefined) {
                continue; // unresolvable peer: the phase gate will park; capacity is re-checked on device write
            }
            const itemKind = await this.endpoint.act(agent => this.taskReconciler(agent).itemKind(kind));
            const capacity = await itemKind?.capacity?.(peer);
            if (capacity === undefined) {
                continue; // kind reports no capacity limit (e.g. groupKey) — the device write is the gate
            }
            const items = peer.stateOf(DesiredStateBehavior).items;
            const added = group.filter(pc => items[itemMapKey(pc.kind, pc.key)] === undefined).length;
            if (capacity.used + added > capacity.limit) {
                throw new TaskCapacityExceededError(
                    `Task ${task.id}: ${kind} on ${peerId} exceeds capacity — needs ${added} slot(s) but only ${capacity.limit - capacity.used} free`,
                );
            }
        }
    }

    async #drive(task: Task): Promise<void> {
        try {
            await this.#admit(task); // fail-fast before any node is touched
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
            this.#spawnRevert(task);
            // A failing persist here must not re-reject the (otherwise handled) drive promise.
            try {
                await this.#persist(task);
            } catch (persistError) {
                logger.error(`Task ${task.id}: failed to persist failure state`, persistError);
            }
        }
    }

    #contextFor(task: Task, reconciler: ReconcilerBehavior): RunningTaskContext {
        const setState = (state: TaskState) => {
            // Terminal states are owned by #drive; gates only flip between running/parked.
            if (
                task.progress.state === state ||
                (task.progress.state !== "running" && task.progress.state !== "parked")
            ) {
                return;
            }
            task.progress.state = state;
            this.#mutex.run(() => this.#writeRecord(task));
        };
        return new RunningTaskContext(
            task,
            id => this.resolvePeerNode(id),
            reconciler,
            setState,
            this.#gateFor(task.id),
        );
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

    // Serialized through the mutex: a spawned revert drives (and persists) concurrently with the original's
    // own persist, so direct concurrent state writes would conflict on the synchronous transaction lock.
    async #persist(task: Task): Promise<void> {
        await this.#mutex.produce(() => this.#writeRecord(task));
    }

    async #writeRecord(task: Task): Promise<void> {
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
