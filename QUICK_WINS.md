# Quick Wins - Immediate Actions
## Code Duplication Remediation

**Priority**: CRITICAL
**Effort**: LOW
**Risk**: LOW
**Timeline**: 1-2 weeks

This document outlines the highest-priority, lowest-risk refactorings that can be implemented immediately to eliminate exact code duplication.

---

## Priority 1: Measurement Server Factory (HIGHEST ROI)

**Impact**: 13 files, 182 lines eliminated
**Effort**: 2-4 hours
**Risk**: MINIMAL
**Files**: See list below

### What to Do

Create a single factory function to replace 13 identical measurement server implementations.

### Implementation Steps

#### Step 1: Create Factory (15 minutes)

Create file: `/packages/node/src/behaviors/utils/MeasurementServerFactory.ts`

```typescript
/**
 * @file MeasurementServerFactory.ts
 * Factory function for creating measurement servers.
 * Eliminates duplication across 13+ measurement server implementations.
 */

import type { ClusterBehavior } from "../ClusterBehavior.js";

/**
 * Creates a measurement server that extends the provided behavior.
 *
 * This factory eliminates the need for separate server files that only
 * contain an empty class extending the behavior.
 *
 * @template T The cluster behavior type
 * @param BehaviorType The behavior class to extend
 * @returns A server class extending the behavior
 *
 * @example
 * ```typescript
 * export const TemperatureMeasurementServer =
 *   createMeasurementServer(TemperatureMeasurementBehavior);
 * ```
 */
export function createMeasurementServer<T extends ClusterBehavior>(
    BehaviorType: new (...args: any[]) => T
): new (...args: any[]) => T {
    return class MeasurementServer extends BehaviorType {} as any;
}
```

#### Step 2: Update Each Server File (10 minutes each, ~2 hours total)

For each of the 13 measurement server files, replace the class with factory usage:

**Before** (`TemperatureMeasurementServer.ts`):
```typescript
import { TemperatureMeasurementBehavior } from "./TemperatureMeasurementBehavior.js";

/**
 * This is the default server implementation of TemperatureMeasurementBehavior.
 */
export class TemperatureMeasurementServer extends TemperatureMeasurementBehavior {}
```

**After**:
```typescript
import { TemperatureMeasurementBehavior } from "./TemperatureMeasurementBehavior.js";
import { createMeasurementServer } from "../utils/MeasurementServerFactory.js";

/**
 * This is the default server implementation of TemperatureMeasurementBehavior.
 */
export const TemperatureMeasurementServer =
    createMeasurementServer(TemperatureMeasurementBehavior);

export type TemperatureMeasurementServer =
    InstanceType<typeof TemperatureMeasurementServer>;
```

#### Step 3: Test (30 minutes)

```bash
# Run tests for all measurement servers
npm test -- --grep "measurement"

# Verify TypeScript compilation
npm run build

# Check specific servers
npm test -- packages/node/src/behaviors/temperature-measurement
npm test -- packages/node/src/behaviors/illuminance-measurement
npm test -- packages/node/src/behaviors/pressure-measurement
```

### Files to Update

1. `/packages/node/src/behaviors/temperature-measurement/TemperatureMeasurementServer.ts`
2. `/packages/node/src/behaviors/illuminance-measurement/IlluminanceMeasurementServer.ts`
3. `/packages/node/src/behaviors/pressure-measurement/PressureMeasurementServer.ts`
4. `/packages/node/src/behaviors/relative-humidity-measurement/RelativeHumidityMeasurementServer.ts`
5. `/packages/node/src/behaviors/flow-measurement/FlowMeasurementServer.ts`
6. `/packages/node/src/behaviors/pm25-concentration-measurement/Pm25ConcentrationMeasurementServer.ts`
7. `/packages/node/src/behaviors/pm10-concentration-measurement/Pm10ConcentrationMeasurementServer.ts`
8. `/packages/node/src/behaviors/carbon-dioxide-concentration-measurement/CarbonDioxideConcentrationMeasurementServer.ts`
9. `/packages/node/src/behaviors/activated-carbon-filter-monitoring/ActivatedCarbonFilterMonitoringServer.ts`
10. `/packages/node/src/behaviors/hepa-filter-monitoring/HepaFilterMonitoringServer.ts`
11. `/packages/node/src/behaviors/water-tank-level-monitoring/WaterTankLevelMonitoringServer.ts`
12. `/packages/node/src/behaviors/formaldehyde-concentration-measurement/FormaldehydeConcentrationMeasurementServer.ts`
13. `/packages/node/src/behaviors/electrical-power-measurement/ElectricalPowerMeasurementServer.ts`

### Success Criteria

- ✅ All 13 files updated
- ✅ All tests pass
- ✅ TypeScript compiles without errors
- ✅ No behavioral changes
- ✅ 182 lines of duplication eliminated

---

## Priority 2: Extract getBootReason() Helper

**Impact**: 3 files, 18 lines eliminated
**Effort**: 1-2 hours
**Risk**: MINIMAL
**Files**: OnOffServer, LevelControlServer, ModeSelectServer

### What to Do

Extract duplicated `getBootReason()` method into shared utility function.

### Implementation Steps

#### Step 1: Create Utility (15 minutes)

Create file: `/packages/node/src/behaviors/utils/ServerHelpers.ts`

```typescript
/**
 * @file ServerHelpers.ts
 * Shared helper functions for server implementations.
 */

import type { Environment } from "../../Environment.js";
import { ServerNode } from "../../node/ServerNode.js";
import { GeneralDiagnosticsBehavior } from "../general-diagnostics/GeneralDiagnosticsBehavior.js";

/**
 * Gets the boot reason from the root endpoint's GeneralDiagnostics behavior.
 *
 * This helper eliminates duplicated code across multiple server implementations
 * that need to access the system boot reason.
 *
 * @param env The server environment
 * @returns Boot reason if GeneralDiagnostics behavior is available, undefined otherwise
 *
 * @example
 * ```typescript
 * const bootReason = getBootReason(this.env);
 * if (bootReason === GeneralDiagnostics.BootReason.PowerOnReboot) {
 *   // Handle power-on reboot
 * }
 * ```
 */
export function getBootReason(env: Environment): number | undefined {
    const rootEndpoint = env.get(ServerNode);
    if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
        return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
    }
    return undefined;
}
```

#### Step 2: Update Server Files (15 minutes each)

**OnOffServer.ts** (line 256-261):
```typescript
// Before:
#getBootReason() {
    const rootEndpoint = this.env.get(ServerNode);
    if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
        return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
    }
}

// After (at top of file):
import { getBootReason } from "../utils/ServerHelpers.js";

// Replace all usages of this.#getBootReason() with:
const bootReason = getBootReason(this.env);
```

**LevelControlServer.ts** (line 596-601) - Same changes

**ModeSelectServer.ts** (line 103-108) - Same changes

#### Step 3: Test (15 minutes)

```bash
# Test affected servers
npm test -- packages/node/src/behaviors/on-off
npm test -- packages/node/src/behaviors/level-control
npm test -- packages/node/src/behaviors/mode-select

# Verify TypeScript
npm run build
```

### Files to Update

1. `/packages/node/src/behaviors/on-off/OnOffServer.ts:256-261`
2. `/packages/node/src/behaviors/level-control/LevelControlServer.ts:596-601`
3. `/packages/node/src/behaviors/mode-select/ModeSelectServer.ts:103-108`

### Success Criteria

- ✅ Utility function created
- ✅ 3 server files updated
- ✅ Private methods removed
- ✅ All tests pass
- ✅ 18 lines eliminated

---

## Priority 3: Session Guard Utility

**Impact**: 3 files, 12 lines saved (67% reduction)
**Effort**: 2-3 hours
**Risk**: LOW
**Files**: SecureSession, NodeSession, GroupSession

### What to Do

Create a factory function for generating type guard methods, eliminating duplicated `assert()` and `is()` implementations.

### Implementation Steps

#### Step 1: Create Utility (20 minutes)

Create file: `/packages/protocol/src/session/SessionGuards.ts`

```typescript
/**
 * @file SessionGuards.ts
 * Factory for creating type guard functions for session classes.
 */

import { InternalError } from "../InternalError.js";

/**
 * Creates type guard functions for a session class.
 *
 * This factory eliminates duplicated assert() and is() methods across
 * different session type implementations.
 *
 * @template T The session type
 * @param SessionClass The session class constructor
 * @param sessionTypeName Human-readable name for error messages
 * @returns Object containing is() and assert() type guard functions
 *
 * @example
 * ```typescript
 * const guard = createSessionGuard(SecureSession, "SecureSession");
 * SecureSession.is = guard.is;
 * SecureSession.assert = guard.assert;
 * ```
 */
export function createSessionGuard<T>(
    SessionClass: new (...args: any[]) => T,
    sessionTypeName: string
) {
    return {
        /**
         * Type guard to check if value is an instance of the session type.
         */
        is(session: unknown): session is T {
            return session instanceof SessionClass;
        },

        /**
         * Assertion that throws if value is not an instance of the session type.
         */
        assert(session: unknown): asserts session is T {
            if (!(session instanceof SessionClass)) {
                throw new InternalError(`${sessionTypeName} type check failed`);
            }
        }
    };
}
```

#### Step 2: Update Session Classes (30 minutes each)

**SecureSession.ts** (lines 21-26):
```typescript
// Before:
export class SecureSession<T extends SecureSession.Events = SecureSession.Events> {
    static assert(session: unknown): asserts session is SecureSession {
        if (!SecureSession.is(session)) {
            throw new InternalError("SecureSession type check failed");
        }
    }

    static is(session: unknown): session is SecureSession {
        return session instanceof SecureSession;
    }
}

// After (at top of file):
import { createSessionGuard } from "./SessionGuards.js";

export class SecureSession<T extends SecureSession.Events = SecureSession.Events> {
    static is: (session: unknown) => session is SecureSession;
    static assert: (session: unknown) => asserts session is SecureSession;

    static {
        const guard = createSessionGuard(SecureSession, "SecureSession");
        this.is = guard.is.bind(guard);
        this.assert = guard.assert.bind(guard);
    }
}
```

**Alternative** (if static blocks are problematic):
```typescript
// After file export:
const SecureSessionGuard = createSessionGuard(SecureSession, "SecureSession");
SecureSession.is = SecureSessionGuard.is;
SecureSession.assert = SecureSessionGuard.assert;
```

**NodeSession.ts** (lines 392-400) - Similar changes

**GroupSession.ts** (lines 229-237) - Similar changes

#### Step 3: Test (30 minutes)

```bash
# Test session type guards
npm test -- packages/protocol/src/session

# Specific tests
npm test -- --grep "type.*guard"
npm test -- --grep "session.*assert"

# Verify TypeScript
npm run build
```

### Files to Update

1. `/packages/protocol/src/session/SecureSession.ts:21-26`
2. `/packages/protocol/src/session/NodeSession.ts:392-400`
3. `/packages/protocol/src/session/GroupSession.ts:229-237`

### Success Criteria

- ✅ SessionGuards utility created
- ✅ 3 session classes updated
- ✅ Type guards still work correctly
- ✅ All tests pass
- ✅ 12 lines eliminated

---

## Priority 4: Timer Helper Utility (Optional)

**Impact**: 3+ files, ~50 lines
**Effort**: 2-3 hours
**Risk**: LOW
**Files**: OnOffServer, IdentifyServer, SwitchServer

### What to Do

Create helper for lazy timer initialization pattern.

### Implementation Steps

#### Step 1: Create Utility (20 minutes)

Create file: `/packages/node/src/behaviors/utils/TimerHelpers.ts`

```typescript
/**
 * @file TimerHelpers.ts
 * Helper utilities for timer management in server behaviors.
 */

import { Time, Timer } from "#general";

/**
 * Creates a lazy-initialized timer getter.
 *
 * The timer is only created when first accessed, and the same instance
 * is returned on subsequent accesses.
 *
 * @param storage Object to store the timer instance
 * @param key Property name for storing the timer
 * @param name Human-readable timer name for debugging
 * @param interval Timer interval
 * @param callback Timer callback function
 * @returns Getter function that returns the timer instance
 *
 * @example
 * ```typescript
 * class MyServer {
 *   protected get myTimer() {
 *     return createLazyTimer(
 *       this.internal,
 *       'myTimer',
 *       'My Timer',
 *       Millis(100),
 *       this.callback(this.#onTick, { lock: true })
 *     )();
 *   }
 * }
 * ```
 */
export function createLazyTimer(
    storage: Record<string, any>,
    key: string,
    name: string,
    interval: number,
    callback: () => void
): () => Timer {
    return () => {
        if (storage[key] === undefined) {
            storage[key] = Time.getPeriodicTimer(name, interval, callback);
        }
        return storage[key];
    };
}
```

#### Step 2: Update Server Files (20 minutes each)

**OnOffServer.ts** (lines 173-183):
```typescript
// Before:
protected get timedOnTimer() {
    let timer = this.internal.timedOnTimer;
    if (timer === undefined) {
        timer = this.internal.timedOnTimer = Time.getPeriodicTimer(
            "Timed on",
            Millis(100),
            this.callback(this.#timedOnTick, { lock: true }),
        );
    }
    return timer;
}

// After:
import { createLazyTimer } from "../utils/TimerHelpers.js";

protected get timedOnTimer() {
    return createLazyTimer(
        this.internal,
        'timedOnTimer',
        'Timed on',
        Millis(100),
        this.callback(this.#timedOnTick, { lock: true })
    )();
}
```

Apply similar changes to IdentifyServer and SwitchServer.

#### Step 3: Test (20 minutes)

```bash
npm test -- packages/node/src/behaviors/on-off
npm test -- packages/node/src/behaviors/identify
npm test -- packages/node/src/behaviors/switch
```

### Success Criteria

- ✅ Timer helper created
- ✅ Servers updated
- ✅ All tests pass
- ✅ ~50 lines simplified

---

## Combined Quick Wins Summary

| Priority | Task | Files | Lines Saved | Effort | Risk |
|----------|------|-------|-------------|--------|------|
| 1 | Measurement Server Factory | 13 | 182 | 2-4h | MINIMAL |
| 2 | getBootReason() Helper | 3 | 18 | 1-2h | MINIMAL |
| 3 | Session Guard Utility | 3 | 12 | 2-3h | LOW |
| 4 | Timer Helper (Optional) | 3+ | 50 | 2-3h | LOW |
| **TOTAL** | **4 tasks** | **22+** | **262** | **7-12h** | **LOW** |

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review this document with team
- [ ] Assign ownership for each task
- [ ] Create tracking tickets/issues
- [ ] Set up feature branch
- [ ] Ensure test environment is ready

### Implementation (Priority 1)
- [ ] Create MeasurementServerFactory.ts
- [ ] Update 13 measurement server files
- [ ] Run tests for all measurement servers
- [ ] Verify TypeScript compilation
- [ ] Code review
- [ ] Merge to main

### Implementation (Priority 2)
- [ ] Create ServerHelpers.ts
- [ ] Update OnOffServer.ts
- [ ] Update LevelControlServer.ts
- [ ] Update ModeSelectServer.ts
- [ ] Run tests
- [ ] Code review
- [ ] Merge to main

### Implementation (Priority 3)
- [ ] Create SessionGuards.ts
- [ ] Update SecureSession.ts
- [ ] Update NodeSession.ts
- [ ] Update GroupSession.ts
- [ ] Run session tests
- [ ] Code review
- [ ] Merge to main

### Implementation (Priority 4 - Optional)
- [ ] Create TimerHelpers.ts
- [ ] Update server files using timers
- [ ] Run tests
- [ ] Code review
- [ ] Merge to main

### Post-Implementation
- [ ] Update documentation
- [ ] Communicate changes to team
- [ ] Monitor for issues
- [ ] Celebrate success! 🎉

---

## Expected Outcomes

After completing these quick wins:

### Quantitative
- **262 lines** of duplicated code eliminated
- **22+ files** refactored
- **4 new utilities** created
- **0 behavioral changes**
- **0 test regressions**

### Qualitative
- Code more maintainable
- Easier to understand server patterns
- Reduced cognitive load
- Better code organization
- Foundation for further refactoring

---

## Next Steps

After completing quick wins, proceed to:

1. **Phase 2: Semantic Consolidation** - See [REFACTORING_RECOMMENDATIONS.md](./REFACTORING_RECOMMENDATIONS.md#phase-2-semantic-consolidation-2-3-weeks)
   - Operational State Validation Mixin
   - Mode Server Base Class
   - Session Lifecycle Template Method
   - Session Crypto Utility
   - BDX Schema Factory

2. **Phase 3: Generator Optimization** - Optimize code generation templates

3. **Phase 4: Codec & Utilities** - Centralize codec patterns

---

## Questions or Issues?

If you encounter problems during implementation:

1. Check existing tests for behavior expectations
2. Review type definitions carefully
3. Consider backward compatibility
4. Ask for help from team members
5. Document any deviations from this plan

---

## Success Metrics

Track these metrics to measure success:

- [ ] All quick wins completed within 1-2 weeks
- [ ] Zero test regressions
- [ ] Zero new TypeScript errors
- [ ] At least 250 lines eliminated
- [ ] Team agrees code is more maintainable
- [ ] Ready to proceed to Phase 2

Good luck! 🚀
