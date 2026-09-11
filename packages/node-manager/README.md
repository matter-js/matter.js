# @matter/node-manager - controller-side node management for matter.js

This package keeps the devices a controller owns in the state the controller intends, and runs multi-step
work — group provisioning, key rotation — as tasks that can be observed, cancelled and undone.

It is a controller-side package, imported directly: `@matter/main` does not re-export it. Use it from a
`ServerNode` that commissions and manages peers.

## Two layers

**Reconciliation.** `ReconcilerBehavior` applies desired state to a peer. An application writes an _intent_
for an _item_ — an ACL entry, a binding, a group key set, a group mapping, a group membership — and the
reconciler writes it to the device, retries what is recoverable, and reports what the device holds. Intents
survive a restart and an offline peer: reconciliation resumes when the peer comes back.

**Tasks.** `TaskManagerBehavior` drives work that spans several intents and several peers, where a failure
half way leaves the fleet in a state nobody asked for. A task writes intents through the reconciler, waits for
them to commit, and records what it changed so the work can be undone.

## Running a task

```ts
const handle = await node.act(agent => {
    const manager = agent.get(TaskManagerBehavior);
    manager.register(MyTask); // built-in types are registered already
    return manager.run(AddNodeToGroup, {
        peerId,
        endpoint: 1,
        groupId: 1,
        groupKeySetId: 1,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0,
        epochStartTime0,
    });
});

await handle.settled();
console.log(handle.status.state, handle.status.wrote);
```

Every verb runs inside an activity, and the task runs outside one: `run` returns as soon as the work is
admitted, so `settled()` is awaited after the activity ends. A handle reads through to the run, so it keeps
answering as the run progresses and after it retires. `settled()` rejects with `TaskManagerClosingError` if the
node shuts down before the run reaches an outcome.

Built-in task types: `AddNodeToGroup`, `RemoveNodeFromGroup`, `RotateGroupKey`, and the `Rollback` that undoes
them.

### One task per target

A task names the _target_ it changes — one peer's group membership, one fabric's key set — and one target has
one task at a time. A second request for a busy target is refused, unless it repeats the `externalId` of the
run that holds it, in which case it joins that run instead of starting a second one:

```ts
const handle = manager.run(AddNodeToGroup, params, { externalId: "provision-kitchen" });
```

Refusals are `TaskRefusedError`s carrying a `TaskFindingCode`, so an interface can render the cause rather
than the message. To ask before committing to the call:

```ts
const feasibility = manager.assess(AddNodeToGroup, params, { externalId: "provision-kitchen" });
// "ready" | "joins" (feasibility.joins names the run) | "blocked" (feasibility.findings says why)
```

`assess` answers from the admission rules themselves, so it reports exactly what `run` would do about
contention. It does not ask the devices about capacity — that happens once the run starts — and it reserves
nothing, so a caller still handles the refusals `run` throws.

## Stopping and undoing

`cancel(runId)` stops a run and undoes what it wrote. The outcome says what happened to the device:

| `TaskCancelOutcome` | meaning                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `Rollback`          | an undo is running; `cancellation.rollback` is its handle                 |
| `NothingToUndo`     | the run had changed nothing                                              |
| `Irreversible`      | the run passed the point its type declines to be reverted, and it stands |

A rollback is a run of its own, so it too can fail — a peer that goes offline mid-undo, for instance. When it
does, the device is left part-changed and only an operator can decide what happens next:

- `retryRollback(runId)` drives the undo again, from what the original recorded.
- `abandon(runId, reason)` gives up on it, leaving the device as it is.

## Seeing what is outstanding

```ts
manager.tasks; // runs that still hold a target
manager.history(20); // retired runs, newest retirement first
manager.failedRollbacks; // failed undos: devices left part-changed, awaiting a retry or an abandon
manager.awaitingRegistration; // runs this build cannot drive: their task type is not registered
manager.get(runId);
manager.forExternalId("provision-kitchen");
```

`events.runChanged` reports every durable change to a run, carrying the status as of that write:

```ts
node.events.taskManager.runChanged.on(status => render(status));
```

History is bounded by `state.historyLimit` (100 by default). A retired run whose rollback could still be
retried is never evicted, so nothing that asks for an operator's attention disappears from these lists.
