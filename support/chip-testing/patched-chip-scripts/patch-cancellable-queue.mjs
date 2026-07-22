// Monkey-patches CHIP's chiptest CancellableQueue.get() to be level-triggered.
//
// Upstream (PR #72527) waits on a multiprocessing.Manager Condition purely on the
// notify() edge and never re-checks queue state. Across the namespace-isolated RPC
// process a notify() landing while the consumer is not parked in wait() is lost, so
// a slow RPC (e.g. accessory Start) can block forever -> CI test hang.
//
// The replacement re-checks real queue/cancel/close state on every 0.1s poll and treats
// the notify only as a wakeup hint, so a lost notify costs <=0.1s instead of hanging.
//
// Self-verifying + idempotent: no-ops if already patched, fails loudly if the upstream
// get() shape drifted (so we notice instead of silently running unpatched).

import { readFileSync, writeFileSync } from "node:fs";

const path = "connectedhomeip/scripts/tests/chiptest/concurrency/work_queue.py";
const marker = "PATCH(lost-wakeup)";

let src = readFileSync(path, "utf8");

if (src.includes(marker)) {
    console.log(`[patch-cancellable-queue] already patched, skipping (${path})`);
    process.exit(0);
}

// Match the whole get() method: from its signature up to the next method (cancel()).
// Tolerant of comment/docstring wording drift; the guard below confirms it is the buggy variant.
const re =
    /( {4}def get\(self, timeout: float \| None = None\) -> QueueElementT:\n)[\s\S]*?(\n {4}def cancel\(self\) -> None:)/;

const match = src.match(re);
if (!match) {
    console.error("[patch-cancellable-queue] FAILED: CancellableQueue.get() not found (upstream drift?)");
    process.exit(1);
}
if (!match[0].includes("wait_for_mp_managed")) {
    console.error("[patch-cancellable-queue] FAILED: edge-triggered wait not present in get() (already changed upstream?)");
    process.exit(1);
}

const newGet = `    def get(self, timeout: float | None = None) -> QueueElementT:
        """
        Get an item from the queue.

        Raises:
            QueueCancelled: if cancellation event is observed.
            EndOfQueue: when there is no more work to do.
            TimeoutError: on timeout if \`timeout\` is not None.
            queue.Empty: if called with \`timeout=0\` and the queue is empty while the queue is neither cancelled nor closed.
        """
        # matter.js PATCH(lost-wakeup): level-triggered wait. Re-check real queue state on every
        # poll instead of trusting a cross-process Manager notify() edge, which is lost when the
        # consumer is not parked in wait() at notify() time and would otherwise hang forever.
        end = None if timeout is None else time.monotonic() + timeout
        while True:
            with self._cond:
                if self._cancel_event.is_set():
                    raise QueueCancelled
                try:
                    return self._queue.get(block=False)
                except queue.Empty:
                    if self._end_of_queue.is_set():
                        raise EndOfQueue
                    if timeout == 0:
                        raise
                if end is None:
                    self._cond.wait(0.1)
                else:
                    remaining = end - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("Timeout when waiting for queue item")
                    self._cond.wait(min(0.1, remaining))`;

src = src.replace(re, newGet + "\n$2");
writeFileSync(path, src);
console.log(`[patch-cancellable-queue] applied lost-wakeup fix to CancellableQueue.get (${path})`);
