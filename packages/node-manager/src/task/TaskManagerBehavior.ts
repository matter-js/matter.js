/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { asError, Bytes, isDeepEqual, Lifecycle, Logger, Mutex, Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Agent, Behavior, ClientNode, DesiredStateBehavior, itemMapKey, Node, ServerNode } from "@matter/node";
import {
    TaskCancelledSignal,
    TaskCapacityExceededError,
    TaskConflictError,
    TaskManagerClosingError,
    TaskNotFoundError,
    TaskNotRevertibleError,
    TaskSuspendedSignal,
} from "./errors.js";
import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroup } from "./groups/AddNodeToGroup.js";
import { REMOVE_NODE_FROM_GROUP_TYPE, RemoveNodeFromGroup } from "./groups/RemoveNodeFromGroup.js";
import { ROTATE_GROUP_KEY_TYPE, RotateGroupKey } from "./groups/RotateGroupKey.js";
import { Revert, REVERT_TYPE } from "./Revert.js";
import { GateControl, RunningTaskContext } from "./RunningTaskContext.js";
import { Task, TaskPersistence } from "./Task.js";
import { TaskCtor, TaskRegistry } from "./TaskRegistry.js";
import { PlannedChange, TaskState, TaskStatus } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(["completed", "failed", "cancelled"]);

const logger = Logger.get("TaskManager");

/**
 * A value as a storage round-trip returns it: serialization drops properties whose value is undefined at every
 * depth, and leaves an array element that is undefined as a hole. Comparing raw values instead rejects an
 * idempotent re-issue of a request with a nested optional.
 *
 * A `Map` becomes its entries because a structural comparison sees no properties on one, and would therefore
 * accept any map in place of any other.
 */
function asStored(value: unknown): unknown {
    if (Array.isArray(value)) {
        const stored = new Array<unknown>(value.length);
        value.forEach((element, index) => {
            if (element !== undefined) {
                stored[index] = asStored(element);
            }
        });
        return stored;
    }
    if (value instanceof Map) {
        return [...value.entries()].map(asStored);
    }
    if (typeof value !== "object" || value === null || Bytes.isBytes(value)) {
        return value;
    }
    const stored: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(value)) {
        if (property !== undefined) {
            stored[key] = asStored(property);
        }
    }
    return stored;
}

export interface TaskHandle {
    readonly id: string;
    readonly status: TaskStatus;
}

/** The retention effect of one persist: ids joining the queue and ids leaving it with their records. */
interface RetentionPlan {
    retired: string[];
    forgotten: string[];
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
        this.#adoptInheritedTerminals();
        this.#registerBuiltins();
        // Driving acts on the node, so the resume pass must wait until the node is online.
        if (this.#rootNode.lifecycle.isOnline) {
            this.#resumePersisted();
        } else {
            this.reactTo(this.#rootNode.lifecycle.online, this.#resumePersisted);
        }
    }

    /**
     * Adopt terminal records from a previous start into the retention queue, dropping those beyond
     * {@link terminalRetention} so a controller that restarts often does not accumulate finished tasks in storage
     * forever. Their relative age is unknown, hence storage order.
     */
    #adoptInheritedTerminals(): void {
        const inherited = Object.entries(this.state.tasks)
            .filter(([, p]) => TERMINAL_STATES.has(p.state))
            .map(([id]) => id);
        const excess = inherited.length - this.terminalRetention;
        if (excess > 0) {
            const tasks = { ...this.state.tasks };
            for (const id of inherited.splice(0, excess)) {
                delete tasks[id];
            }
            this.state.tasks = tasks;
        }
        for (const id of inherited) {
            this.internal.terminated.add(id);
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
        this.internal.registry.register(REMOVE_NODE_FROM_GROUP_TYPE, RemoveNodeFromGroup);
        this.internal.registry.register(ROTATE_GROUP_KEY_TYPE, RotateGroupKey);
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
        // Resuming drives a phase, which the dispose drain may already have passed and no persist can record.
        this.#refuseIfClosing(`Task type "${type}" cannot be registered`);
        this.internal.registry.register(type, ctor);
        // Apps register custom task types after construction; resume their persisted, non-terminal tasks now.
        this.#resumeType(type);
    }

    /**
     * Load the persisted tasks of a registered type. A non-terminal task resumes driving; a terminal one becomes
     * observable history — visible to {@link get} and {@link tasks} and still cancellable through its recorded
     * changeSet — but is never driven again.
     */
    #resumeType(type: string): void {
        if (!this.internal.registry.has(type)) {
            return;
        }
        for (const [id, p] of Object.entries(this.state.tasks)) {
            if (p.type !== type || this.internal.live.has(id)) {
                continue;
            }
            const task = this.internal.registry.create(type, id, p.params, p);
            if (TERMINAL_STATES.has(p.state)) {
                this.internal.live.set(id, task);
                continue;
            }
            // A persisted `parked` task must re-drive; #drive only advances `running` tasks, and the phase's
            // gate re-parks from live reachability if the peer is still offline.
            if (task.progress.state === "parked") {
                task.progress.state = "running";
            }
            this.internal.live.set(id, task);
            this.#track(task);
        }
    }

    // The gate must exist before driving starts — it is the only home for an abort reason, so a cancel or shutdown
    // arriving before the first phase builds its gate would otherwise be discarded. It is created fresh so an abort
    // recorded for an earlier run of this id cannot carry over.
    #track(task: Task): void {
        this.internal.gates.set(task.id, { wake: new Observable() });
        const drivePromise: Promise<void> = this.#drive(task).finally(() => {
            // A task turns terminal before its drive promise settles, so a re-run may already own this id's
            // bookkeeping; only its current owner may clear it.
            if (this.internal.driving.get(task.id) !== drivePromise) {
                return;
            }
            this.internal.driving.delete(task.id);
            this.internal.gates.delete(task.id);
            this.internal.cancelling.delete(task.id);
        });
        this.internal.driving.set(task.id, drivePromise);
    }

    /**
     * Start `type` with `params`, or join the live task an identical request already started. An `externalId`
     * becomes an id this task answers to, whether the request started it or joined it, so every caller can
     * observe and {@link cancel} the work it asked for. Ids are exclusive among unfinished work: one that
     * already names another live task is refused rather than silently resolving elsewhere.
     */
    run(type: string, params: unknown, opts?: { externalId?: string }): TaskHandle {
        return this.#handle(this.#spawn(type, params, {}, opts?.externalId));
    }

    /** Shared creation path so callers (e.g. #spawnRevert) can seed persisted fields before the first persist. */
    #spawn(type: string, params: unknown, seed: Partial<TaskPersistence>, externalId?: string): Task {
        const id = this.internal.registry.idFor(type, params);
        // Driving started now would outlive the dispose drain and write to peers after close, with no way to
        // record what it did.
        this.#refuseIfClosing(`Task ${id} cannot start`);
        // A cancel of this id is mid-flight: deduping would hand the caller a task that is being torn down, and
        // replacing it would take over bookkeeping the cancel is still waiting on.
        if (this.internal.cancelling.has(id)) {
            throw new TaskConflictError(`Task ${id} rejected: a cancel of this task is still in flight`);
        }
        if (externalId !== undefined) {
            this.#requireClaimableExternalId(externalId, id);
        }
        const existing = this.internal.live.get(id);
        if (existing !== undefined && !TERMINAL_STATES.has(existing.progress.state)) {
            // Only an identical request is idempotent; reusing the id with other values would apply neither the
            // running task's parameters nor the new ones the caller asked for.
            if (!this.#sameParams(existing.params, params)) {
                throw new TaskConflictError(
                    `Task ${id} rejected: a live task with this id is running with different parameters`,
                );
            }
            if (externalId !== undefined && !existing.externalIds.has(externalId)) {
                existing.externalIds.add(externalId);
                // The joining caller's id must outlive this process, or a restart hands it a handle onto nothing.
                this.#mutex.run(() => this.#writeRecord(existing));
            }
            return existing;
        }
        const pendingRevert = this.#pendingRevertFor(id);
        if (pendingRevert !== undefined) {
            throw new TaskConflictError(
                `Task ${id} rejected: rollback ${pendingRevert.id} is still in flight and would undo it again`,
            );
        }
        const task = this.internal.registry.create(type, id, params, seed);
        if (externalId !== undefined) {
            task.externalIds.add(externalId);
        }
        // Synchronous exclusivity check: no await between reading `live` and live.set below, so there is no TOCTOU
        // window. The just-created task is discarded on throw (never tracked or persisted).
        const rk = task.resourceKey();
        if (rk !== undefined) {
            for (const t of this.internal.live.values()) {
                if (t.id !== task.id && !TERMINAL_STATES.has(t.progress.state) && this.#occupies(t, rk)) {
                    throw new TaskConflictError(
                        `Task ${task.id} rejected: resource ${rk} is in use by live task ${t.id}; wait until it reaches a terminal state`,
                    );
                }
            }
        }
        // A replaced terminal task must leave the retention queue with it, or its eviction would later drop the
        // fresh task that now holds the id.
        this.internal.terminated.delete(id);
        this.internal.live.set(id, task);
        this.#track(task);
        return task;
    }

    /**
     * An external id must resolve to the task the caller asked for and to nothing else, so it may not name any
     * retained task's own id, nor already belong to other unfinished work. A finished task keeps the ids it ran
     * under, and {@link #find} prefers the live holder, so history does not block reuse of an id.
     */
    #requireClaimableExternalId(externalId: string, id: string): void {
        const conflict = this.internal.live.get(externalId) ?? this.#liveHolderOf(externalId);
        if (conflict !== undefined && conflict.id !== id) {
            throw new TaskConflictError(
                `Task ${id} rejected: external id "${externalId}" already refers to task ${conflict.id}`,
            );
        }
    }

    #liveHolderOf(externalId: string): Task | undefined {
        for (const t of this.internal.live.values()) {
            if (t.externalIds.has(externalId) && !TERMINAL_STATES.has(t.progress.state)) {
                return t;
            }
        }
        return undefined;
    }

    /** A rollback rewrites exactly the intents a re-run would re-apply, so the two must never overlap. */
    #pendingRevertFor(id: string): Task | undefined {
        for (const t of this.internal.live.values()) {
            if (t.revertOf === id && !TERMINAL_STATES.has(t.progress.state)) {
                return t;
            }
        }
        return undefined;
    }

    /**
     * Whether two parameter sets describe the same request, compared as storage would hand them back: a resumed
     * task's parameters would otherwise never match the request that started it.
     */
    #sameParams(a: unknown, b: unknown): boolean {
        return isDeepEqual(asStored(a), asStored(b));
    }

    // A revert has no resourceKey of its own (so it is never rejected), but it rewrites the intents in its
    // changeSet, so it occupies those resources against a new exclusive task. Resource key format is
    // `${kind}:${key}`, matching each task's resourceKey().
    #occupies(t: Task, rk: string): boolean {
        if (t.resourceKey() === rk) {
            return true;
        }
        return t instanceof Revert && t.params.entries.some(e => `${e.kind}:${e.key}` === rk);
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
        // Finished work keeps the ids it ran under, so an id can have several holders: the live one is the one
        // meant by it, and among finished ones the most recent.
        let retained: Task | undefined;
        for (const t of this.internal.live.values()) {
            if (!t.externalIds.has(idOrExternalId)) {
                continue;
            }
            if (!TERMINAL_STATES.has(t.progress.state)) {
                return t;
            }
            retained = t;
        }
        return retained;
    }

    #handle(task: Task): TaskHandle {
        // A held handle must keep answering for the task it names; a snapshot would freeze at creation time.
        return {
            id: task.id,
            get status() {
                return task.status;
            },
        };
    }

    /**
     * Cancel a task: stop forward driving, then spawn a revert task that rolls back the changeSet as an ordinary
     * task (parks on offline peers, resumes after restart). Does not await the revert — the caller observes it
     * via the returned handle.
     *
     * Each outcome has exactly one meaning: a handle is the rollback, `undefined` is a task with nothing to roll
     * back, and {@link TaskNotFoundError} is an id no retained task answers to (including a task whose recorded
     * rollback retention has since forgotten).
     *
     * Throws {@link TaskManagerClosingError} if shutdown intervenes before the cancel can be recorded; the task
     * then keeps its non-terminal state and the cancel must be re-issued after the next start.
     */
    async cancel(idOrExternalId: string): Promise<TaskHandle | undefined> {
        const task = this.#find(idOrExternalId);
        if (task === undefined) {
            throw new TaskNotFoundError(`Cannot cancel "${idOrExternalId}": no task is retained under that id`);
        }
        if (task.progress.state === "cancelled") {
            const revert = this.#revertOf(task);
            return revert === undefined ? undefined : this.#handle(revert);
        }

        // A task past its point of no return declines cancel with zero side effects (gate untouched, state kept).
        if (!task.revertible) {
            throw new TaskNotRevertibleError(`Task ${task.id} is not revertible: ${task.notRevertibleReason}`);
        }

        // Stop forward driving so the changeset is final before we revert it. The flag also covers the
        // between-phase gap the gate cannot: the driver checks it synchronously before advancing a phase.
        this.internal.cancelling.add(task.id);
        this.#abortGate(task.id, new TaskCancelledSignal(`Task ${task.id} cancelled`));
        try {
            await this.internal.driving.get(task.id);
        } finally {
            // A `cancelling` entry left behind refuses every future run of this id for the process lifetime.
            this.internal.gates.delete(task.id);
            this.internal.cancelling.delete(task.id);
        }

        // Shutdown took over the unwind: state can no longer be persisted, so leave the task non-terminal and
        // unreverted rather than claiming a cancel that storage would contradict on the next start.
        this.#refuseIfClosing(`Task ${task.id} cannot be cancelled`);

        // Spawned before the state changes: a refused rollback must leave the task as it was, not cancelled in
        // memory and unchanged in storage.
        const revert = this.#spawnRevert(task);
        // running/parked → cancelled; an already-terminal (completed/failed) task keeps its truthful state.
        if (task.progress.state === "running" || task.progress.state === "parked") {
            task.progress.state = "cancelled";
        }
        await this.#persist(task, revert);
        return revert === undefined ? undefined : this.#handle(revert);
    }

    // Teardown starts at the node, not at this behavior: `Construction.close` applies `Destroying` before it runs
    // the destructor that closes behaviors, so this reads true for the whole of our own teardown — from which point
    // `endpoint.act` refuses and no state write can land.
    get #isClosing(): boolean {
        const { status } = this.endpoint.construction;
        return status === Lifecycle.Status.Destroying || status === Lifecycle.Status.Destroyed;
    }

    #refuseIfClosing(subject: string): void {
        if (this.#isClosing) {
            throw new TaskManagerClosingError(`${subject}: the task manager is shutting down`);
        }
    }

    /** Spawn (or reuse) the revert task for `task`, linking both directions. Returns undefined if no changeSet. */
    #spawnRevert(task: Task): Task | undefined {
        // A failed revert surfaces as `failed` for operator attention; reverting a revert would recurse unbounded.
        if (task.type === REVERT_TYPE) {
            return undefined;
        }
        // Past a task's point of no return there is nothing to roll back to; suppress auto-rollback too.
        if (!task.revertible) {
            return undefined;
        }
        if (task.revertTaskId !== undefined) {
            return this.#revertOf(task);
        }
        if (task.changeSet.length === 0) {
            return undefined;
        }
        const revert = this.#spawn(
            REVERT_TYPE,
            { originalId: task.id, entries: task.changeSet },
            { revertOf: task.id },
        );
        task.revertTaskId = revert.id;
        return revert;
    }

    /** The rollback a task recorded, or undefined if it never had one. A record retention forgot is not "none". */
    #revertOf(task: Task): Task | undefined {
        if (task.revertTaskId === undefined) {
            return undefined;
        }
        const revert = this.#find(task.revertTaskId);
        if (revert === undefined) {
            throw new TaskNotFoundError(
                `Task ${task.id} names rollback ${task.revertTaskId}, which is no longer retained`,
            );
        }
        return revert;
    }

    #abortGate(id: string, reason: unknown): void {
        const gate = this.internal.gates.get(id);
        if (gate === undefined) {
            return;
        }
        gate.aborted = reason;
        gate.wake.emit();
    }

    /** Throw a recorded abort (cancel or shutdown) so the driver stops before persisting or mutating a peer. */
    #throwIfAborted(task: Task): void {
        const aborted = this.internal.gates.get(task.id)?.aborted;
        if (aborted !== undefined) {
            throw asError(aborted);
        }
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
            if (itemKind?.excludeFromAdmission) {
                continue; // capacity counts a coarser resource another kind already gates (e.g. membership vs group)
            }
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
            this.#throwIfAborted(task);
            // Persist before first phase so a crash-resume sees the task.
            await this.#persist(task);
            while (task.progress.phaseIndex < task.phases.length && task.progress.state === "running") {
                const phase = task.phases[task.progress.phaseIndex];
                const ctx = await this.endpoint.act(agent => this.#contextFor(task, this.taskReconciler(agent)));
                // A phase mutates the peer before it reaches its gate, so this is the last point at which an
                // abort accepted meanwhile can still prevent the write.
                this.#throwIfAborted(task);
                await phase.run(ctx);
                // A cancel accepted while the phase ran must leave phaseIndex on that phase: revertibility is
                // phase-based, so advancing it can cross a task's point of no return and suppress the rollback.
                if (this.internal.cancelling.has(task.id)) {
                    throw new TaskCancelledSignal(`Task ${task.id} cancelled`);
                }
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
            // Teardown: neither the failure nor a rollback of it can be recorded, and the rollback's driving would
            // outlive the dispose drain. Leave the task as the next start can resume it.
            if (this.#isClosing) {
                logger.warn(
                    `Task ${task.id} interrupted by shutdown; its persisted state is left for the next start`,
                    e,
                );
                return;
            }
            task.progress.state = "failed";
            task.error = e instanceof Error ? e.message : String(e);
            logger.error(`Task ${task.id} failed`, e);
            // Neither a rollback this manager refuses nor a failing persist may re-reject the (otherwise handled)
            // drive promise: that turns into an unhandled rejection and a cancel awaiting this task throws.
            let revert: Task | undefined;
            try {
                revert = this.#spawnRevert(task);
            } catch (revertError) {
                logger.error(`Task ${task.id}: cannot roll back`, revertError);
            }
            try {
                await this.#persist(task, revert);
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
            () => [...this.#rootNode.peers],
        );
    }

    #gateStateFor(id: string): TaskManagerBehavior.GateState {
        let gate = this.internal.gates.get(id);
        if (gate === undefined) {
            gate = { wake: new Observable() };
            this.internal.gates.set(id, gate);
        }
        return gate;
    }

    /** Per-task gate control: cancel/shutdown set `aborted`; `onAbort` wakes a parked gate to observe it. */
    #gateFor(id: string): GateControl {
        const gate = this.#gateStateFor(id);
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
    async #persist(task: Task, paired?: Task): Promise<void> {
        await this.#mutex.produce(() => this.#writeRecord(task, paired));
    }

    // A task that names a revert and the revert itself go into one transaction: written separately, a crash
    // between the two loses the rollback while the forward record still promises it.
    async #writeRecord(task: Task, paired?: Task): Promise<void> {
        const written = paired === undefined ? [task] : [task, paired];
        await this.endpoint.act(agent => {
            // Records, retention decision and its bookkeeping belong to one transaction: a task re-run between them
            // would leave the queue disagreeing with the records, and a write that never gets here must touch
            // neither.
            const records = written.map(t => [t.id, t.toPersistence()] as const);
            const retention = this.#planRetention(written);
            const self = agent.get(TaskManagerBehavior);
            const tasks = { ...self.state.tasks };
            for (const id of retention.forgotten) {
                delete tasks[id];
            }
            for (const [id, record] of records) {
                tasks[id] = record;
            }
            self.state.tasks = tasks;
            this.#applyRetention(retention);
        });
    }

    /**
     * Number of terminal tasks kept for observation through {@link get} and {@link tasks} before the oldest are
     * forgotten. The bound covers retained records, which a restart makes observable again as soon as their type
     * is registered. Override to tune how much finished history a controller retains.
     */
    protected get terminalRetention(): number {
        return 50;
    }

    /**
     * Choose the retention effect of one transaction: the tasks it retires and the oldest ids to forget beyond
     * {@link terminalRetention}, so finished work stays observable for a while without growing without bound.
     * The forgotten ids leave persisted state in the same write; {@link #applyRetention} commits the rest.
     */
    #planRetention(written: Task[]): RetentionPlan {
        const retired = written.filter(
            // A re-run may already own this id: retiring the previous run would expose the live task to eviction.
            task => TERMINAL_STATES.has(task.progress.state) && this.internal.live.get(task.id) === task,
        );
        const queued = new Set([...this.internal.terminated, ...retired.map(task => task.id)]);
        const writing = new Set(written.map(task => task.id));
        const forgotten = new Array<string>();
        for (const id of queued) {
            if (queued.size - forgotten.length <= this.terminalRetention) {
                break;
            }
            // An id this transaction writes may not be forgotten by it: the record would survive in storage while
            // leaving both `live` and the queue, so nothing could observe or ever prune it again.
            if (!writing.has(id)) {
                forgotten.push(id);
            }
        }
        return { retired: retired.map(task => task.id), forgotten };
    }

    #applyRetention({ retired, forgotten }: RetentionPlan): void {
        for (const id of retired) {
            this.internal.terminated.add(id);
        }
        for (const id of forgotten) {
            this.internal.terminated.delete(id);
            this.internal.live.delete(id);
        }
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
        cancelling = new Set<string>();
        terminated = new Set<string>();
        persistMutex?: Mutex;
    }

    export class Events extends Behavior.Events {}
}
