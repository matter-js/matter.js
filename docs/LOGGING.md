# Logging Levels

How to choose a log level in matter.js. The goal is consistency: the same kind of
event should always land on the same level, and each level should mean one thing.

matter.js is a library. Its logs are read by two audiences:

- **Developers / integrators** diagnosing behavior — mostly at `debug`, sometimes `info`.
- **Operators / end users** running a deployment — at `notice` and above by default.

## The six levels

| Level    | Value | Audience        | One-line meaning                                             |
| -------- | ----- | --------------- | ------------------------------------------------------------ |
| `debug`  | 0     | developer       | Full internal detail.                                        |
| `info`   | 1     | developer/ops   | Normal narrative + dev-relevant hints.                       |
| `notice` | 2     | operator/user   | Operator-significant event, within normal operation.         |
| `warn`   | 3     | operator/user   | Anomaly contained to a single operation.                     |
| `error`  | 4     | operator/user   | A whole feature/subsystem is broken.                         |
| `fatal`  | 5     | operator/user   | The runtime itself cannot continue.                          |

## Two questions decide the level

The scheme uses **one discriminator per boundary**, so each border is a single yes/no.

**1. Audience gate — who is this for?**

- For a developer reading internals → `debug`, or `info` if it is normal high-level
  progress worth seeing during active monitoring.
- For an operator/user running the system → `notice` and above.

**2. Blast radius — within the user-facing band, how much is affected?**

- One operation → `warn`
- A whole feature/subsystem → `error`
- The whole runtime → `fatal`

Blast radius decides severity **within** the anomaly band (`warn`/`error`/`fatal`); it is
not affected by "who must fix it." The **`notice`↔`warn` border is the exception**: there
the question is whether the condition implies someone (developer / user / config) should
investigate or fix it. If nobody can — the cause is external/operational, or we
auto-recover on a known schedule, and it is handled — it is not a `warn`.

Two more levers shape the result:

- **Volume.** High-frequency or environmentally-caused conditions drop a level to avoid
  spam: a per-operation anomaly that can fire in bulk (wrong network interface, session
  churn) belongs at `info`/`debug`, not `warn`/`notice` — unless a single occurrence
  explains a user-observable symptom, in which case keep it at `notice` (de-duplicated).
- **Audience.** `debug`/`info` are for developers; `notice`+ are seen by operators.

```
DEBUG → INFO   : pure wire/diagnostic detail  vs  worth a dev seeing on a healthy run
INFO  → NOTICE : dev-facing / high-volume     vs  operator-significant, lower-volume
NOTICE→ WARN   : nobody-can-fix, handled      vs  someone should investigate/fix
WARN  → ERROR  : single operation             vs  whole feature/subsystem
ERROR → FATAL  : a feature dead               vs  the whole runtime dead
```

## Per-level definitions

### `fatal` (5)

The owning runtime/process/node cannot continue and will stop (or already stopped).
Whole-instance death.

- **Test:** after this, does this runtime keep doing useful work? If no → `fatal`.
- Reserve it. If anything keeps running, it is `error`. A single dead node in a
  multi-node server is `error`, not `fatal`.
- Examples: an unhandled error reaching the top-level reporter; the shared storage
  backend corrupt or unwritable so nothing can persist; a required network/FS
  permission denied at startup so the service cannot run.

### `error` (4)

A whole feature or subsystem is broken and stays broken until someone (the integrating
developer or the operator) acts. matter.js cannot fix it itself. Blast radius is a
functionality, not the process.

- Examples: a node fails to come up; API misuse that disables a capability; an
  OS/environment error that kills a subsystem but not the process.
- Persistent broad degradation lands here once the user is left with a broken
  experience — even when the root cause is external and we keep retrying.

### `warn` (3)

Something anomalous happened, contained to a single operation, and either recovered or
failed without taking down the surrounding feature. It hints at a latent problem worth
a look.

- Examples: a transient socket send failure on one message; a DCL rate-limit we backed
  off from; one command rejected for malformed input; a retryable timeout.
- Border to `error` = blast radius. Border to `notice` = **does it imply someone should
  investigate or fix it?** If nobody can (external/operational, or we auto-recover on a
  schedule) and it is handled, it drops to `notice` — or to `info` if it is high-volume
  or purely dev-diagnostic.

### `notice` (2)

An operationally significant event the operator should see **even at reduced production
verbosity**, within matter.js's normal operating envelope, where **no fix by us, the
developer, or the user is implied** — because nothing is wrong, the cause is
external/operational, or we auto-recover on a known schedule. Use it also for a handled
condition that **explains a user-observable symptom** (e.g. dropped events) so the cause
is visible.

- Examples: node commissioned/decommissioned; fabric added/removed; subscription
  created/cancelled; a commissioning attempt the device legitimately rejected (wrong
  passcode); an announce/update that failed but will be retried on schedule; events
  dropped because a cluster is unmodeled (de-duplicated).
- **Significance- and volume-gated.** Not every state change is `notice`. High-frequency
  operational traffic — e.g. sessions establishing/ending — belongs at `info`; reserve
  `notice` for rarer, operator-significant lifecycle (commissioning, fabric/identity,
  subscriptions).
- **Not for internal process or control-flow mechanism** (a failsafe timer expiring, a
  retry limit reached, a reconnect attempt) → `debug`/`info`. Log the operator-relevant
  *outcome* at `notice`; the mechanism lower.

### `info` (1)

The normal-operation narrative plus anything a developer should be able to see on a
healthy run without dropping to `debug`:

- High-level progress and lifecycle (sessions establishing/ending, connection steps).
- **Dev-actionable hints** — e.g. a performance note worth acting on.
- **Known/handled conditions we cannot fix** that are too frequent for `notice` but should
  not be buried in `debug` — e.g. a CASE session that fails because the peer is not on our
  fabric (the controller's choice; we handle it, but a developer asking "why won't this
  device connect?" needs to see it).
- **Test:** would an operator running at `notice` want every one of these? If no, but a
  developer watching a healthy system would → `info`.

### `debug` (0)

Pure internal/diagnostic detail: wire traffic, state transitions, internal decisions, and
**routine protocol mechanics** (status responses, BUSY, retransmits, acks) that need no
developer attention. The default home for high-volume "expected" noise. (A handled
operation-level failure a developer may need to explain behavior belongs at `info`, not
here.)

## Cross-cutting practices

These are best practice in all new code. Their status as *binding* (must-fix in existing
code) is still under review.

1. **The level reflects how the code HANDLES the situation, not how scary the underlying
   error looks.** A transient timeout we retry is `warn`, even though "timeout" sounds
   bad.
2. **Log where you handle/swallow, not where you throw or rethrow.** No log-and-throw —
   that double-reports, and the caller owns the severity decision.
3. **One event → one line at one level.** Don't re-log the same failure at each stack
   frame.
4. **Routine protocol mechanics** (status responses, BUSY, retransmits) are `debug`, never
   `warn`+. A handled operation-level failure a developer may need to explain behavior can
   sit at `info`.
5. **Attach the error/cause object when it adds diagnostic value.** A message alone is fine
   when the cause object adds nothing.
6. **Phrase for the audience.** A `notice`+ line is read by users — clear, no internal
   jargon. A `debug`/`info` line may use developer shorthand.
7. **Volume is a downgrade lever.** Drop high-frequency or environmentally-caused
   conditions to `info`/`debug` to avoid spam — unless a single occurrence explains a
   user-observable symptom (then `notice`, de-duplicated).
8. **Shutdown path.** Failures while the runtime is intentionally shutting down are at most
   `warn` — nothing meaningful is broken.
