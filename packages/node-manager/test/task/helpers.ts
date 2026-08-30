/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task, TaskDefinition, TaskPersistence } from "#task/Task.js";
import { TaskHandle, TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { PlannedChange, RunId, TaskPhase, TaskStatus } from "#task/types.js";
import { Immutable, InternalError, Observable } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemKind, ItemMode, ItemState, ManagedItem, itemMapKey } from "@matter/node";
import { Status } from "@matter/types";

/** Mirrors the reconciler's default recoverability rule for a failure status code. */
function recoverable(code?: number): boolean {
    return code === Status.Timeout || code === Status.Busy;
}

/**
 * A synthetic task definition whose phases are supplied inline, for unit-testing the manager/driver. A test
 * populates the tables below for the tag it runs under, so one definition serves every case.
 */
export const SyntheticTask: TaskDefinition<{ tag: string }> & {
    phasesByTag: Record<string, TaskPhase[]>;
    plannedChangesByTag: Record<string, PlannedChange[]>;
} = {
    type: "synthetic",
    phasesByTag: {},
    plannedChangesByTag: {},
    slotKeyFor(params) {
        return `synthetic:${params.tag}`;
    },
    phases(params) {
        return SyntheticTask.phasesByTag[params.tag] ?? new Array<TaskPhase>();
    },
    plannedChanges(params) {
        return SyntheticTask.plannedChangesByTag[params.tag] ?? new Array<PlannedChange>();
    },
};

/**
 * The live Task the manager built for `runId`. Valid in the synchronous continuation right after `run()`
 * returns, before any phase has had a chance to advance the driver past this tick.
 */
export function liveTask(manager: TaskManagerBehavior, runId: RunId): Task {
    const task = manager.internal.runs.liveRun(runId);
    if (task === undefined) {
        throw new InternalError(`No live run #${runId}`);
    }
    return task;
}

/**
 * Runs `hook` with every record one task writes, by patching that instance alone — so a test observes the run
 * it started and not every run of its type.
 */
export function onPersisted(task: Task, hook: (record: TaskPersistence) => void): void {
    const original = task.toPersistence.bind(task);
    task.toPersistence = () => {
        const record = original();
        hook(record);
        return record;
    };
}

/** Fires `onCompleted` once, the first time `runId`'s task persists a "completed" record — after the task is
 * terminal but before its driver settles and hands back the slot. */
export function onTerminalWrite(manager: TaskManagerBehavior, runId: RunId, onCompleted: () => void): void {
    let fired = false;
    onPersisted(liveTask(manager, runId), record => {
        if (!fired && record.state === "completed") {
            fired = true;
            onCompleted();
        }
    });
}

/**
 * In-memory peer for unit-testing the convergence gates. Exposes only the surface the gate reads:
 * `DesiredStateBehavior` items + `itemChanged`, `NetworkClient` subscription status, and the reachability
 * source of truth (`behaviors.internalsOf(NetworkClient).activeSubscription`). The fake doubles as the
 * reconciler: `reconcile(node, {verify})` flips the peer's items to `committed` for keys the device "has".
 *
 * One simplification of the real engine: a key the device neither has nor fails stays `pending` instead of
 * committing, which is how a test holds a gate parked.
 */
export class FakePeer {
    readonly items: Record<string, ManagedItem> = {};
    readonly has = new Set<string>();
    /** Keys the device rejects with an unrecoverable status: apply fails, and the following pass drops them. */
    readonly rejects = new Set<string>();
    /** Remaining recoverable apply failures per key: each pass consumes one, then the key behaves normally. */
    readonly transientFailures = new Map<string, number>();
    readonly itemChanged = new Observable<[item: ManagedItem]>();
    readonly itemRemoved = new Observable<[kind: string, key: string]>();
    readonly subscriptionStatusChanged = new Observable<[isActive: boolean]>();
    #subscribed = true;
    reconciles = 0;

    constructor(readonly id: string) {}

    /** A real (non-Sustained) subscription instance reads as active; undefined reads as unreachable. */
    get #activeSubscription() {
        return this.#subscribed ? {} : undefined;
    }

    setReachable(reachable: boolean) {
        this.#subscribed = reachable;
        this.subscriptionStatusChanged.emit(reachable);
    }

    /** Add a desired item in a given state and announce the change, as DesiredStateBehavior would. */
    addItem(kind: string, key: string, state: ItemState = "pending") {
        const item: ManagedItem = {
            kind,
            key,
            intent: {},
            mode: "converge",
            status: { state, updateTimestamp: 0 },
        };
        this.items[itemMapKey(kind, key)] = item;
        this.itemChanged.emit(item);
    }

    /** Record the desired-state mutations the gate observes so cancel-revert order can be asserted. */
    readonly removeOrder = new Array<string>();

    // Stores real intent+mode (not a placeholder) so the context's prior-capture reads true values.
    setIntent(kind: string, key: string, intent: unknown = {}, mode: ItemMode = "converge") {
        const existing = this.items[itemMapKey(kind, key)];
        const item: ManagedItem = {
            kind,
            key,
            intent,
            mode,
            status: existing?.status ?? { state: "pending", updateTimestamp: 0 },
        };
        this.items[itemMapKey(kind, key)] = item;
        this.itemChanged.emit(item);
    }

    /** DesiredStateBehavior.removeIntent stand-in: flag deletePending, then drop on the next reconcile. */
    removeIntent(kind: string, key: string) {
        const item = this.items[itemMapKey(kind, key)];
        if (item === undefined) {
            return;
        }
        this.removeOrder.push(itemMapKey(kind, key));
        item.status = { ...item.status, state: "deletePending" };
        this.itemChanged.emit(item);
    }

    /** Fake Endpoint.act: synchronously runs the callback with a fake agent exposing DesiredStateBehavior. */
    act<T>(fn: (agent: { get(type: unknown): unknown }) => T): T {
        const desired = {
            setIntent: (kind: string, key: string, intent: unknown, mode?: ItemMode) =>
                this.setIntent(kind, key, intent, mode),
            removeIntent: (kind: string, key: string) => this.removeIntent(kind, key),
        };
        return fn({ get: (type: unknown) => (type === DesiredStateBehavior ? desired : undefined) });
    }

    /** Mark a key as present on the device, so the next verify-reconcile commits it. */
    markHas(kind: string, key: string) {
        this.has.add(itemMapKey(kind, key));
    }

    /** Mark a key the device refuses with an unrecoverable status. */
    markRejects(kind: string, key: string) {
        this.rejects.add(itemMapKey(kind, key));
    }

    /** Mark a key whose next `times` applies fail with a recoverable status, so the reconciler retries them. */
    markFailsRecoverably(kind: string, key: string, times: number) {
        this.transientFailures.set(itemMapKey(kind, key), times);
    }

    /** DesiredStateBehavior.dropItem stand-in: forget the item and announce it on `itemRemoved`. */
    dropItem(kind: string, key: string) {
        if (this.items[itemMapKey(kind, key)] === undefined) {
            return;
        }
        delete this.items[itemMapKey(kind, key)];
        this.itemRemoved.emit(kind, key);
    }

    setState(kind: string, key: string, state: ItemState, failureCode?: number) {
        const item = this.items[itemMapKey(kind, key)];
        item.status = { ...item.status, state, failureCode };
        this.itemChanged.emit(item);
    }

    /**
     * Fake ReconcilerBehavior.reconcile over one peer's items, one pass per call, mirroring what
     * `planActions`/`executeActions` do with each item state: apply a pending item, retry or drop a failed one
     * by the recoverability of its status code, and drop a removal once the device has taken it.
     */
    async reconcile(node: ClientNode, options?: { verify?: boolean }) {
        this.reconciles++;
        if (!options?.verify || !this.#subscribed) {
            return;
        }
        const peer = node as unknown as FakePeer;
        for (const item of Object.values(peer.items)) {
            switch (item.status.state) {
                case "pending":
                    peer.#apply(item);
                    break;
                case "commitFailed":
                    if (recoverable(item.status.failureCode)) {
                        peer.#apply(item);
                    } else {
                        peer.dropItem(item.kind, item.key);
                    }
                    break;
                case "deletePending":
                    peer.dropItem(item.kind, item.key);
                    break;
                case "committed":
                    break;
            }
        }
    }

    /** One apply attempt against the device, with the status it writes back. */
    #apply(item: ManagedItem) {
        const id = itemMapKey(item.kind, item.key);
        const transient = this.transientFailures.get(id) ?? 0;
        if (transient > 0) {
            this.transientFailures.set(id, transient - 1);
            this.setState(item.kind, item.key, "commitFailed", Status.Busy);
        } else if (this.rejects.has(id)) {
            this.setState(item.kind, item.key, "commitFailed", Status.ConstraintError);
        } else if (this.has.has(id)) {
            this.setState(item.kind, item.key, "committed");
        }
    }

    /** Reconciler stand-in: no kind has dependents by default (tests override per case). */
    itemKind(_kind: string): ItemKind | undefined {
        return undefined;
    }

    eventsOf(type: unknown): unknown {
        return type === DesiredStateBehavior
            ? { itemChanged: this.itemChanged, itemRemoved: this.itemRemoved }
            : { subscriptionStatusChanged: this.subscriptionStatusChanged };
    }

    stateOf(type: unknown): unknown {
        return type === DesiredStateBehavior ? { items: this.items } : { isDisabled: false };
    }

    get behaviors() {
        const activeSubscription = this.#activeSubscription;
        return {
            has: () => true,
            internalsOf: () => ({ activeSubscription }),
        };
    }

    asNode(): ClientNode {
        return this as unknown as ClientNode;
    }
}

/** Behavior state reaches a test through the project's deep-immutable view, so helpers read that shape. */
type RunRecords = Immutable<Record<string, TaskPersistence>>;
type RunRecord = Immutable<TaskPersistence>;

/**
 * Persisted records for a slot, newest run first. Records are per-run now, so a slot can hold several; a test
 * that means "the record for this slot" wants {@link recordFor}, and one that means a specific attempt should
 * name its runId.
 */
export function recordsFor(runs: RunRecords, slotKey: string): readonly RunRecord[] {
    return Object.values(runs)
        .filter(r => r.slotKey === slotKey)
        .sort((a, b) => b.runId - a.runId);
}

/** The newest persisted record for a slot, or undefined if no run of it was ever recorded. */
export function recordFor(runs: RunRecords, slotKey: string): RunRecord | undefined {
    return recordsFor(runs, slotKey)[0];
}

/** The newest record for a slot, failing with the slot name when there is none. */
export function requireRecordFor(runs: RunRecords, slotKey: string): RunRecord {
    const record = recordFor(runs, slotKey);
    if (record === undefined) {
        throw new Error(`No persisted run of slot ${slotKey}`);
    }
    return record;
}

/**
 * The persisted rollback the newest run of `slotKey` *recorded*, resolved through that run's own
 * `revertRunId`.
 *
 * Deliberately not `find(r => r.revertOf === original.runId)`: an assertion on the result's `revertOf` would
 * then be checking the predicate that selected it, which is how a migration ends up with a test that cannot
 * fail. Resolving through the forward link keeps the two sides independent.
 */
export function revertRecordOf(runs: RunRecords, slotKey: string): RunRecord | undefined {
    const revertRunId = recordFor(runs, slotKey)?.revertRunId;
    return revertRunId === undefined ? undefined : runs[String(revertRunId)];
}

/** Every persisted rollback of any run of `slotKey`, for asserting that none exists. */
export function revertRecordsOf(runs: RunRecords, slotKey: string): readonly RunRecord[] {
    const undone = new Set(recordsFor(runs, slotKey).map(r => r.runId));
    return Object.values(runs).filter(r => r.revertOf !== undefined && undone.has(r.revertOf));
}

/**
 * The newest run of a slot, live or retired. Lookup is by run identity now, so a test that names a slot has to
 * resolve it — and resolving it here keeps each assertion about the thing it was always about.
 */
export function requireRunIdOfSlot(manager: TaskManagerBehavior, slotKey: string): RunId {
    const runId = runIdOfSlot(manager, slotKey);
    if (runId === undefined) {
        throw new Error(`No run answers to slot ${slotKey}`);
    }
    return runId;
}

export function runIdOfSlot(manager: TaskManagerBehavior, slotKey: string): RunId | undefined {
    const live = manager.tasks.find(t => t.status.slotKey === slotKey);
    if (live !== undefined) {
        return live.runId;
    }
    return manager.history().find(h => h.status.slotKey === slotKey)?.runId;
}

/** The handle for the newest run of a slot. */
export function handleOfSlot(manager: TaskManagerBehavior, slotKey: string): TaskHandle | undefined {
    const runId = runIdOfSlot(manager, slotKey);
    return runId === undefined ? undefined : manager.get(runId);
}

/** The status of the newest run of a slot. */
export function statusOfSlot(manager: TaskManagerBehavior, slotKey: string): TaskStatus | undefined {
    return handleOfSlot(manager, slotKey)?.status;
}

/** The status of the newest run of a slot, failing with the slot name when nothing answers to it. */
export function requireStatusOfSlot(manager: TaskManagerBehavior, slotKey: string): TaskStatus {
    const status = statusOfSlot(manager, slotKey);
    if (status === undefined) {
        throw new Error(`No run answers to slot ${slotKey}`);
    }
    return status;
}

/** Cancel the newest run of a slot, or report that nothing answers to it. */
export function cancelSlot(manager: TaskManagerBehavior, slotKey: string): Promise<TaskHandle | undefined> {
    const runId = runIdOfSlot(manager, slotKey);
    if (runId === undefined) {
        // Mirrors cancel() of a run nothing answers to, so a test asserting that outcome still exercises it.
        return manager.cancel(RunId(Number.MAX_SAFE_INTEGER));
    }
    return manager.cancel(runId);
}

/** The slot key of the rollback of the newest run of `slotKey`, or undefined if none was recorded. */
export function revertSlotOf(runs: RunRecords, slotKey: string): string | undefined {
    return revertRecordOf(runs, slotKey)?.slotKey;
}

/**
 * Wait for one specific run to reach one of `states`. A slot can hold several runs, so waiting on the slot
 * would match a previous run that is already in the state the caller is waiting for.
 */
export async function awaitRun(
    node: { act<T>(fn: (agent: { get(t: unknown): unknown }) => T): Promise<T> },
    manager: { new (...args: never[]): unknown },
    runId: RunId,
    ...states: string[]
): Promise<void> {
    for (let i = 0; i < 2_000; i++) {
        const settled = await node.act(a => {
            const m = a.get(manager) as TaskManagerBehavior;
            const state = m.get(runId)?.status.state;
            if (state === undefined || !states.includes(state)) {
                return false;
            }
            // A run turns terminal one step before it retires; a caller acting here would find the slot held.
            return (
                !(["completed", "failed", "cancelled"] as string[]).includes(state) ||
                !m.tasks.some(t => t.runId === runId)
            );
        });
        if (settled) {
            return;
        }
        // Integration gates settle on macrotasks, not on time alone, so both have to be pumped.
        await MockTime.advance(100);
        await MockTime.macrotask;
    }
    throw new Error(`Run #${runId} did not reach state ${states.join("|")}`);
}
