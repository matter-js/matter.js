# Resource Leak and Memory Management Issues

This document catalogs resource leak and memory management issues found during code analysis of matter.js.

**Status**: For further investigation and prioritization
**Date**: 2025-11-15

---

## HIGH PRIORITY

### 4.2 Unbounded Device Record Growth in MDNS Discovery

**File**: `packages/protocol/src/mdns/MdnsClient.ts:1196-1201`

**Issue**: Three maps grow unbounded as devices are discovered:
- `#operationalDeviceRecords`
- `#commissionableDeviceRecords`
- `#discoveredIpRecords`

**Code**:
```typescript
this.#operationalDeviceRecords.set(matterName, device);
this.#commissionableDeviceRecords.set(...);
this.#discoveredIpRecords.set(...);
// No maximum size limits - maps grow unbounded
```

**Impact**: In long-running discovery scenarios, memory usage grows without bounds as new devices are discovered.

**Recommendation**:
- Implement LRU cache with configurable maximum size
- Add periodic cleanup of stale/expired records
- Consider time-based expiration beyond just TTL

---

### 4.3 Transport Listener Cleanup Incomplete

**File**: `packages/protocol/src/protocol/ExchangeManager.ts:64, 442-483`

**Issue**: Event listeners are added via `this.#listeners.set(netInterface, listener)` and registered on `transport.added`. During transport deletion, cleanup may race with active message processing.

**Code**:
```typescript
// Line 444-467: Adding listener
this.#listeners.set(
    netInterface,
    netInterface.onData((socket, data) => {
        // ... event handling ...
    }),
);

// Line 471-483: Deleting listener
#deleteListener(netInterface: ConnectionlessTransport) {
    const listener = this.#listeners.get(netInterface);
    if (listener === undefined) return;
    this.#listeners.delete(netInterface);

    const closer = listener.close()
        .catch(e => logger.error("Error closing network listener", e))
        .finally(() => this.#closers.delete(closer));
    this.#closers.add(closer);
}
```

**Impact**: If transport is deleted during active message processing, pending message handlers may access deleted resources.

**Recommendation**:
- Ensure all pending operations complete before deleting transport
- Add reference counting for active message handlers

---

### 4.4 MDNS Waiters Without Timers Not Resolved on Close

**File**: `packages/protocol/src/mdns/MdnsClient.ts:840-841`

**Issue**: During `close()`, only waiters with timers are resolved. Waiters without timers remain pending.

**Code**:
```typescript
async close() {
    this.#closing = true;
    this.#observers.close();
    this.#periodicTimer.stop();
    this.#queryTimer?.stop();

    // Only resolves waiters that HAVE timers!
    [...this.#recordWaiters.keys()].forEach(queryId =>
        this.#finishWaiter(queryId, !!this.#recordWaiters.get(queryId)?.timer),
    );
    // Missing: clear other collections
}
```

**Impact**: Promises that are waiting for MDNS responses never resolve, preventing proper cleanup and potentially blocking shutdown.

**Recommendation**:
- Resolve/reject all waiters during close, regardless of timer presence
- Add timeout enforcement for all async operations

---

## MEDIUM PRIORITY

### 4.5 Session-Subscription Circular References

**File**: `packages/protocol/src/session/SessionManager.ts:334-335`

**Issue**: Circular references between Session → Observable → Subscription → Session may prevent garbage collection.

**Code**:
```typescript
const subscriptionsChanged = (subscription: Subscription) => {
    if (session.isClosing) return;
    this.#subscriptionsChanged.emit(session, subscription);
};

session.subscriptions.added.on(subscriptionsChanged);  // Session -> Observable
session.subscriptions.deleted.on(subscriptionsChanged); // Session -> Observable
// Observable -> Subscription -> Session (circular)
```

**Impact**: Sessions may not be garbage collected even after being closed, if subscription references remain.

**Recommendation**:
- Use weak references where appropriate
- Explicitly clear all observers during session cleanup
- Add explicit disposal pattern for observables

---

### 4.6 Listener Callback Outside Try Block Protection

**File**: `packages/protocol/src/interaction/SubscriptionClient.ts:76-95`

**Issue**: Messenger cleanup is in try-finally, but listener callback is outside, risking resource leak if listener throws.

**Code**:
```typescript
async onNewExchange(exchange: MessageExchange) {
    const messenger = new IncomingInteractionClientMessenger(exchange);

    let dataReport: DecodedDataReport;
    try {
        dataReport = await messenger.readAggregateDataReport(undefined, [...this.#listeners.keys()]);
    } finally {
        messenger.close().catch(error => logger.info("Error closing client messenger", error));
    }

    const listener = this.#listeners.get(subscriptionId);
    await listener?.(dataReport); // Listener call OUTSIDE try block!
}
```

**Impact**: If listener throws an exception, messenger may not be fully cleaned up.

**Recommendation**:
- Move listener call inside try block or add separate try-catch
- Ensure messenger cleanup happens regardless of listener errors

---

### 4.7 Truncated Query Timer Cache Unbounded

**File**: `packages/protocol/src/mdns/MdnsServer.ts:293-299`

**Issue**: `#truncatedQueryCache` grows without size limits as queries are processed.

**Code**:
```typescript
this.#truncatedQueryCache.set(key, {
    message,
    timer: Time.getTimer(`Truncated MDNS message ${key}`, Millis(400 + Math.floor(Math.random() * 100)), () =>
        this.#processTruncatedQuery(key),
    ).start(),
});
```

**Impact**: High-frequency MDNS queries could accumulate cache entries faster than they expire.

**Recommendation**:
- Add maximum cache size with LRU eviction
- Monitor cache size in production

---

### 4.8 Cached Records Not Cleared on Close

**File**: `packages/protocol/src/mdns/MdnsServer.ts:220-228`

**Issue**: `#recordsGenerator` is not cleared during close(), keeping service registrations in memory.

**Code**:
```typescript
async close() {
    this.#observers.close();
    await this.#records.close();
    for (const { timer } of this.#truncatedQueryCache.values()) {
        timer.stop();
    }
    this.#truncatedQueryCache.clear();
    this.#recordLastSentAsMulticastAnswer.clear();
    // Missing: this.#recordsGenerator.clear(); if needed
}
```

**Impact**: Memory leak if MDNS server is repeatedly started and stopped.

**Recommendation**:
- Add explicit cleanup of all internal maps and caches
- Verify all resources are released during close

---

### 4.9 Continuous Discovery Resources Leaked on Exception

**File**: `packages/protocol/src/mdns/MdnsClient.ts:757-824`

**Issue**: `criteria` object added to `targetCriteriaProviders` (line 792) may not be deleted if exception occurs before finally block.

**Code**:
```typescript
async findCommissionableDevicesContinuously(...) {
    // ...
    this.targetCriteriaProviders.add(criteria); // Line 792: Added but...

    try {
        // ... long loop ...
    } finally {
        this.targetCriteriaProviders.delete(criteria); // Only deleted in finally
    }
}
```

**Impact**: If method is called repeatedly with exceptions, criteria objects accumulate in the set.

**Recommendation**:
- Ensure finally block always executes (it should in JavaScript)
- Add defensive checks in finally block

---

## INVESTIGATION NEEDED

### 4.10 Event Listeners Accumulate on Subscription Observables

**Files**: Multiple files in `packages/protocol/src/session/`

**Issue**: Event listeners registered on subscription observables may accumulate if not properly removed.

**Recommendation**:
- Audit all observer registration patterns
- Ensure observers are explicitly removed when subscriptions end
- Consider using WeakMap for automatic cleanup

---

### 4.11 Untracked Standalone ACK Promise

**File**: `packages/protocol/src/protocol/MessageExchange.ts:154-157`

**Issue**: Promise from `sendStandaloneAckForMessage()` is not tracked, only has error handler.

**Code**:
```typescript
#receivedMessageAckTimer = Time.getTimer("Ack receipt timeout", MRP.STANDALONE_ACK_TIMEOUT, () => {
    if (this.#receivedMessageToAck !== undefined) {
        const messageToAck = this.#receivedMessageToAck;
        this.#receivedMessageToAck = undefined;
        // TODO: We need to track this promise later (Line 154 comment!)
        this.sendStandaloneAckForMessage(messageToAck).catch(error =>
            logger.error("An error happened when sending a standalone ack", error),
        );
    }
});
```

**Impact**: ACK sending failures are logged but not tracked for retry or cleanup.

**Recommendation**:
- Add promise tracking as indicated by TODO
- Consider retry logic for failed ACKs

---

## Summary Table

| Priority | Count | Primary Issues |
|----------|-------|----------------|
| HIGH | 4 | Unbounded growth (4.2, 4.7), incomplete cleanup (4.3, 4.4) |
| MEDIUM | 5 | Circular refs (4.5), resource protection (4.6, 4.8, 4.9) |
| Investigation | 2 | Event listener patterns (4.10, 4.11) |

**Total**: 11 resource management issues requiring attention
