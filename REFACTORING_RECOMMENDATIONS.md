# Refactoring Recommendations
## Matter.js Code Duplication Remediation Strategy

**Document Version**: 1.0
**Date**: 2025-11-15
**Related**: [CODE_DUPLICATION_ANALYSIS.md](./CODE_DUPLICATION_ANALYSIS.md)

---

## Implementation Strategy

This document outlines a phased approach to eliminating code duplication identified in the matter.js codebase, organized by priority, risk, and effort.

---

## Phase 1: Quick Wins (1-2 weeks)

**Objective**: Eliminate exact duplication with minimal risk
**Target**: 16 files, ~392 lines saved
**Risk Level**: LOW
**Testing Required**: Unit tests only

### 1.1 Create Measurement Server Factory

**Files Affected**: 13 server files
**Lines Saved**: ~182
**Effort**: 2-4 hours

**Implementation**:

```typescript
// File: /packages/node/src/behaviors/utils/MeasurementServerFactory.ts
/**
 * Creates a measurement server that extends the provided behavior.
 * This factory eliminates duplication across 13+ measurement server implementations.
 */
export function createMeasurementServer<T extends ClusterBehavior>(
    BehaviorType: new (...args: any[]) => T
): new (...args: any[]) => T {
    return class MeasurementServer extends BehaviorType {} as any;
}
```

**Refactor Each Server**:

```typescript
// Before: /packages/node/src/behaviors/temperature-measurement/TemperatureMeasurementServer.ts
import { TemperatureMeasurementBehavior } from "./TemperatureMeasurementBehavior.js";

export class TemperatureMeasurementServer extends TemperatureMeasurementBehavior {}

// After:
import { TemperatureMeasurementBehavior } from "./TemperatureMeasurementBehavior.js";
import { createMeasurementServer } from "../utils/MeasurementServerFactory.js";

export const TemperatureMeasurementServer = createMeasurementServer(TemperatureMeasurementBehavior);
export type TemperatureMeasurementServer = InstanceType<typeof TemperatureMeasurementServer>;
```

**Testing**:
- Run existing unit tests for all 13 measurement servers
- Verify type compatibility
- No behavior changes expected

**Files to Refactor**:
1. `temperature-measurement/TemperatureMeasurementServer.ts`
2. `illuminance-measurement/IlluminanceMeasurementServer.ts`
3. `pressure-measurement/PressureMeasurementServer.ts`
4. `relative-humidity-measurement/RelativeHumidityMeasurementServer.ts`
5. `flow-measurement/FlowMeasurementServer.ts`
6. `pm25-concentration-measurement/Pm25ConcentrationMeasurementServer.ts`
7. `pm10-concentration-measurement/Pm10ConcentrationMeasurementServer.ts`
8. `carbon-dioxide-concentration-measurement/CarbonDioxideConcentrationMeasurementServer.ts`
9. `activated-carbon-filter-monitoring/ActivatedCarbonFilterMonitoringServer.ts`
10. `hepa-filter-monitoring/HepaFilterMonitoringServer.ts`
11. `water-tank-level-monitoring/WaterTankLevelMonitoringServer.ts`
12. `formaldehyde-concentration-measurement/FormaldehydeConcentrationMeasurementServer.ts`
13. `electrical-power-measurement/ElectricalPowerMeasurementServer.ts`

---

### 1.2 Extract getBootReason() Helper

**Files Affected**: 3 server files
**Lines Saved**: ~18
**Effort**: 1-2 hours

**Implementation**:

```typescript
// File: /packages/node/src/behaviors/utils/ServerHelpers.ts
import { Environment } from "../Environment.js";
import { ServerNode } from "../node/ServerNode.js";
import { GeneralDiagnosticsBehavior } from "../behaviors/general-diagnostics/GeneralDiagnosticsBehavior.js";

/**
 * Gets the boot reason from the root endpoint's GeneralDiagnostics behavior.
 * @param env The server environment
 * @returns Boot reason if available, undefined otherwise
 */
export function getBootReason(env: Environment): number | undefined {
    const rootEndpoint = env.get(ServerNode);
    if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
        return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
    }
    return undefined;
}
```

**Refactor Each Server**:

```typescript
// Before: /packages/node/src/behaviors/on-off/OnOffServer.ts
#getBootReason() {
    const rootEndpoint = this.env.get(ServerNode);
    if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
        return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
    }
}

// After:
import { getBootReason } from "../utils/ServerHelpers.js";

// Replace method with direct call
const bootReason = getBootReason(this.env);
```

**Testing**:
- Unit tests for `getBootReason()` helper
- Integration tests for servers using boot reason
- Verify behavior on nodes with/without GeneralDiagnostics

**Files to Refactor**:
1. `on-off/OnOffServer.ts:256-261`
2. `level-control/LevelControlServer.ts:596-601`
3. `mode-select/ModeSelectServer.ts:103-108`

---

### 1.3 Create Session Guard Utility

**Files Affected**: 3 session files
**Lines Saved**: ~12 (67% reduction)
**Effort**: 2-3 hours

**Implementation**:

```typescript
// File: /packages/protocol/src/session/SessionGuards.ts
import { InternalError } from "../InternalError.js";

/**
 * Creates type guard functions for session classes.
 * Eliminates duplicated assert() and is() methods across session types.
 */
export function createSessionGuard<T>(
    SessionClass: new (...args: any[]) => T,
    sessionTypeName: string
) {
    return {
        /**
         * Type guard to check if value is an instance of the session type
         */
        is(session: unknown): session is T {
            return session instanceof SessionClass;
        },

        /**
         * Assertion that throws if value is not an instance of the session type
         */
        assert(session: unknown): asserts session is T {
            if (!this.is(session)) {
                throw new InternalError(`${sessionTypeName} type check failed`);
            }
        }
    };
}
```

**Refactor Each Session**:

```typescript
// Before: /packages/protocol/src/session/SecureSession.ts
export class SecureSession {
    static assert(session: unknown): asserts session is SecureSession {
        if (!SecureSession.is(session)) {
            throw new InternalError("SecureSession type check failed");
        }
    }

    static is(session: unknown): session is SecureSession {
        return session instanceof SecureSession;
    }
}

// After:
import { createSessionGuard } from "./SessionGuards.js";

export class SecureSession {
    // ... rest of class

    static {
        const guard = createSessionGuard(SecureSession, "SecureSession");
        this.is = guard.is.bind(guard);
        this.assert = guard.assert.bind(guard);
    }

    static is: (session: unknown) => session is SecureSession;
    static assert: (session: unknown) => asserts session is SecureSession;
}
```

**Alternative Approach** (if static initializer blocks are not preferred):

```typescript
const SecureSessionGuard = createSessionGuard(SecureSession, "SecureSession");

export class SecureSession {
    static is = SecureSessionGuard.is;
    static assert = SecureSessionGuard.assert;
}
```

**Testing**:
- Unit tests for `createSessionGuard()`
- Verify type guards work correctly
- Test assertion throws on invalid types

**Files to Refactor**:
1. `session/SecureSession.ts:21-26`
2. `session/NodeSession.ts:392-400`
3. `session/GroupSession.ts:229-237`

---

## Phase 2: Semantic Consolidation (2-3 weeks)

**Objective**: Abstract common patterns with shared logic
**Target**: 15 files, ~512 lines saved
**Risk Level**: MEDIUM
**Testing Required**: Integration tests required

### 2.1 Create Operational State Validation Mixin

**Files Affected**: 3 server files
**Lines Saved**: ~174
**Effort**: 8-12 hours

**Implementation**:

```typescript
// File: /packages/node/src/behaviors/utils/OperationalStateValidation.ts
import { ImplementationError } from "#general";
import { OperationalState } from "#types";

/**
 * Mixin providing shared validation logic for Operational State servers.
 * Eliminates 174 lines of duplicated validation code across 3 implementations.
 */
export class OperationalStateValidation {
    constructor(
        private state: {
            operationalStateList: Array<{ operationalStateId: number }>;
            phaseList: Array<any> | null;
            currentPhase: number | null;
            operationalState: number;
            operationalError: { errorStateId: number };
        },
        private events: {
            operationalError: {
                emit(data: { errorState: any }, context: any): void;
            };
        },
        private context: any
    ) {}

    assertOperationalStateList(): void {
        if (!this.state.operationalStateList.some(
            ({ operationalStateId }) => operationalStateId === OperationalState.OperationalStateEnum.Error,
        )) {
            throw new ImplementationError(`Operational state list must at least contain an error entry.`);
        }
    }

    syncCurrentPhaseWithPhaseList(): void {
        if (this.state.phaseList === null || this.state.phaseList.length === 0) {
            this.state.currentPhase = null;
        }
    }

    assertCurrentPhase(currentPhase: number | null): void {
        if (this.state.phaseList === null || this.state.phaseList.length === 0) {
            if (currentPhase === null) {
                return;
            }
            throw new ImplementationError(
                "Cannot set current phase to an other value than null when phase list is empty",
            );
        }

        if (currentPhase === null || currentPhase < 0 || currentPhase >= this.state.phaseList.length) {
            throw new ImplementationError(
                `Current phase ${currentPhase} is out of bounds for phase list of length ${this.state.phaseList.length}`,
            );
        }
    }

    assertOperationalState(newState: number, oldState: number): void {
        if (!this.state.operationalStateList.some(({ operationalStateId }) => operationalStateId === newState)) {
            throw new ImplementationError(
                `Cannot set operational state id ${newState} as it is not in the operational state list`,
            );
        }
        if (
            oldState === OperationalState.OperationalStateEnum.Error &&
            this.state.operationalError.errorStateId !== OperationalState.ErrorState.NoError &&
            newState !== OperationalState.OperationalStateEnum.Error
        ) {
            this.state.operationalError = { errorStateId: OperationalState.ErrorState.NoError };
        }
    }

    handleOperationalError(operationalError: OperationalState.ErrorStateStruct): void {
        if (operationalError.errorStateId === OperationalState.ErrorState.NoError) {
            return;
        }

        if (this.state.operationalState !== OperationalState.OperationalStateEnum.Error) {
            this.state.operationalState = OperationalState.OperationalStateEnum.Error;
        }

        this.events.operationalError.emit({ errorState: operationalError }, this.context);
    }
}
```

**Refactor Servers**:

```typescript
// Before: /packages/node/src/behaviors/operational-state/OperationalStateServer.ts
export class OperationalStateServer extends OperationalStateBehavior {
    #assertOperationalStateList() { /* 10 lines */ }
    #syncCurrentPhaseWithPhaseList() { /* 5 lines */ }
    #assertCurrentPhase(currentPhase: number | null) { /* 15 lines */ }
    #assertOperationalState(newState: number, oldState: number) { /* 15 lines */ }
    #handleOperationalError(operationalError: OperationalState.ErrorStateStruct) { /* 11 lines */ }
}

// After:
import { OperationalStateValidation } from "../utils/OperationalStateValidation.js";

export class OperationalStateServer extends OperationalStateBehavior {
    #validation = new OperationalStateValidation(this.state, this.events, this.context);

    #assertOperationalStateList() {
        return this.#validation.assertOperationalStateList();
    }

    #syncCurrentPhaseWithPhaseList() {
        return this.#validation.syncCurrentPhaseWithPhaseList();
    }

    #assertCurrentPhase(currentPhase: number | null) {
        return this.#validation.assertCurrentPhase(currentPhase);
    }

    #assertOperationalState(newState: number, oldState: number) {
        return this.#validation.assertOperationalState(newState, oldState);
    }

    #handleOperationalError(operationalError: OperationalState.ErrorStateStruct) {
        return this.#validation.handleOperationalError(operationalError);
    }
}
```

**Testing**:
- Unit tests for `OperationalStateValidation` class
- Integration tests for all 3 operational state servers
- Test edge cases: empty lists, null values, error states
- Regression tests for existing functionality

**Files to Refactor**:
1. `operational-state/OperationalStateServer.ts`
2. `oven-cavity-operational-state/OvenCavityOperationalStateServer.ts` (has additional `#assertPhaseList()`)
3. `rvc-operational-state/RvcOperationalStateServer.ts`

---

### 2.2 Create Mode Server Base Class

**Files Affected**: 6 server files
**Lines Saved**: ~210
**Effort**: 12-16 hours

**Implementation**:

```typescript
// File: /packages/node/src/behaviors/utils/ModeServerBase.ts
import { MaybePromise } from "#general";
import { ModeBase } from "#types";
import { ModeUtils } from "./ModeUtils.js";

/**
 * Abstract base class for Mode server implementations.
 * Provides common initialization and mode change logic with configurable required tags.
 *
 * Eliminates 210 lines of duplicated code across 6 mode server implementations.
 */
export abstract class ModeServerBase<T extends any> {
    /**
     * Mode tags that must be present in the supportedModes list.
     * Subclasses must define this property.
     */
    protected abstract readonly requiredModeTags: number[];

    /**
     * Override to provide additional mode tag validation.
     * Called after standard validation in assertSupportedModes().
     */
    protected validateAdditionalModeTags?(): void;

    override initialize(): MaybePromise {
        this.assertSupportedModesWithRequiredTags();
        ModeUtils.assertMode(this.state.supportedModes, this.state.currentMode);
        this.reactTo(this.events.currentMode$Changing, this.#assertMode);
        return this.initializeAdditional?.();
    }

    /**
     * Override to add additional initialization logic.
     */
    protected initializeAdditional?(): MaybePromise;

    private assertSupportedModesWithRequiredTags(): void {
        ModeUtils.assertSupportedModes(this.state.supportedModes);

        // Validate all required tags are present
        for (const requiredTag of this.requiredModeTags) {
            const hasTag = this.state.supportedModes.some(({ modeTags }) =>
                modeTags.some(({ value }) => value === requiredTag),
            );

            if (!hasTag) {
                throw new ImplementationError(
                    `Provided supportedModes must include mode tag ${requiredTag}`
                );
            }
        }

        // Allow subclasses to add additional validation
        this.validateAdditionalModeTags?.();
    }

    #assertMode = (newMode: number): void => {
        ModeUtils.assertMode(this.state.supportedModes, newMode);
    };

    override changeToMode({
        newMode
    }: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse> {
        const result = ModeUtils.assertModeChange(
            this.state.supportedModes,
            this.state.currentMode,
            newMode
        );

        if (result.status === ModeBase.ModeChangeStatus.Success) {
            this.state.currentMode = newMode;
        }

        return result;
    }
}
```

**Refactor Servers**:

```typescript
// Before: /packages/node/src/behaviors/dishwasher-mode/DishwasherModeServer.ts
export class DishwasherModeServer extends DishwasherModeBehavior {
    override initialize(): MaybePromise {
        this.#assertSupportedModes();
        ModeUtils.assertMode(this.state.supportedModes, this.state.currentMode);
        this.reactTo(this.events.currentMode$Changing, this.#assertMode);
    }

    #assertSupportedModes() {
        ModeUtils.assertSupportedModes(this.state.supportedModes);
        if (!this.state.supportedModes.some(({ modeTags }) =>
            modeTags.some(({ value }) => value === DishwasherMode.ModeTag.Normal),
        )) {
            throw new Error("Provided supportedModes need to include at least Normal mode tag");
        }
    }

    #assertMode(newMode: number) {
        ModeUtils.assertMode(this.state.supportedModes, newMode);
    }

    override changeToMode({ newMode }: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse> {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status === ModeBase.ModeChangeStatus.Success) {
            this.state.currentMode = newMode;
        }
        return result;
    }
}

// After:
import { ModeServerBase } from "../utils/ModeServerBase.js";
import { DishwasherMode } from "#types";

export class DishwasherModeServer extends ModeServerBase<DishwasherModeBehavior> {
    protected readonly requiredModeTags = [DishwasherMode.ModeTag.Normal];
}
```

**Example with Multiple Required Tags**:

```typescript
// /packages/node/src/behaviors/rvc-run-mode/RvcRunModeServer.ts
export class RvcRunModeServer extends ModeServerBase<RvcRunModeBehavior> {
    protected readonly requiredModeTags = [
        RvcRunMode.ModeTag.Idle,
        RvcRunMode.ModeTag.Cleaning
    ];
}
```

**Testing**:
- Unit tests for `ModeServerBase` class
- Integration tests for all 6 mode servers
- Test mode change validation
- Test initialization with missing required tags (should throw)
- Regression tests

**Files to Refactor**:
1. `microwave-oven-mode/MicrowaveOvenModeServer.ts` → requires `Normal` tag
2. `dishwasher-mode/DishwasherModeServer.ts` → requires `Normal` tag
3. `oven-mode/OvenModeServer.ts` → requires `Bake` tag
4. `laundry-washer-mode/LaundryWasherModeServer.ts` → requires `Normal` tag
5. `rvc-clean-mode/RvcCleanModeServer.ts` → requires `Vacuum` + `Mop` tags
6. `rvc-run-mode/RvcRunModeServer.ts` → requires `Idle` + `Cleaning` tags

---

### 2.3 Refactor Session Lifecycle with Template Method

**Files Affected**: 3 session files
**Lines Saved**: ~29 (50% reduction)
**Effort**: 6-8 hours

**Implementation**:

```typescript
// Modify base Session class: /packages/protocol/src/session/Session.ts
export abstract class Session<T extends Session.Events = Session.Events> {
    protected isDestroyed = false;

    /**
     * Template method for session cleanup.
     * Subclasses can override hooks for custom behavior.
     */
    protected end(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;

        // Hook for pre-cleanup actions
        this.beforeEnd();

        // Standard cleanup
        this.context.close();

        // Hook for post-cleanup actions
        this.afterEnd();
    }

    /**
     * Override to perform actions before context close.
     */
    protected beforeEnd(): void {}

    /**
     * Override to perform actions after context close.
     */
    protected afterEnd(): void {}
}
```

**Refactor Implementations**:

```typescript
// Before: /packages/protocol/src/session/InsecureSession.ts
end() {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    this.context.close();
    this.session?.end();
}

// After:
protected afterEnd(): void {
    this.session?.end();
}

// The base end() method handles isDestroyed check and context.close()
```

```typescript
// Before: /packages/protocol/src/session/NodeSession.ts
async destroy(shouldSendCloseSession = false): Promise<void> {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    await this.#closingAfterExchangeFinished;
    if (shouldSendCloseSession) {
        await this.sendCloseSession();
    }
    this.context.close();
    this.session?.end();
}

// After:
async destroy(shouldSendCloseSession = false): Promise<void> {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    await this.#closingAfterExchangeFinished;

    if (shouldSendCloseSession) {
        await this.sendCloseSession();
    }

    this.end();
}

protected afterEnd(): void {
    this.session?.end();
}
```

**Testing**:
- Unit tests for session lifecycle
- Test destroy with/without close session
- Test end() is idempotent
- Integration tests for session cleanup
- Verify no resource leaks

**Files to Refactor**:
1. `session/NodeSession.ts:328-367`
2. `session/InsecureSession.ts:92-100`
3. `session/GroupSession.ts:218-225`

---

### 2.4 Create SessionCrypto Utility

**Files Affected**: 2 session files
**Lines Saved**: ~23 (74% reduction)
**Effort**: 4-6 hours

**Implementation**:

```typescript
// File: /packages/protocol/src/session/SessionCrypto.ts
import { Crypto } from "#crypto";
import { Bytes } from "#general";

/**
 * Utility class for session encryption/decryption operations.
 * Centralizes nonce generation and crypto operations used across session types.
 */
export class SessionCrypto {
    /**
     * Encrypts payload with automatic nonce generation
     */
    static encode(
        encryptionKey: Bytes,
        payload: Bytes,
        messageCounter: number,
        nodeId?: NodeId
    ): Bytes {
        const nonce = this.generateNonce(messageCounter, nodeId);
        return Crypto.encrypt(encryptionKey, payload, nonce);
    }

    /**
     * Decrypts encrypted data, extracting nonce from packet
     */
    static decode(
        decryptionKey: Bytes,
        encrypted: Bytes,
        messageCounter: number,
        nodeId?: NodeId
    ): Bytes {
        const nonce = this.generateNonce(messageCounter, nodeId);
        return Crypto.decrypt(decryptionKey, encrypted, nonce);
    }

    /**
     * Generates nonce from message counter and optional node ID
     */
    private static generateNonce(messageCounter: number, nodeId?: NodeId): Bytes {
        const nonce = new Uint8Array(13);
        const view = new DataView(nonce.buffer);

        // Write message counter (4 bytes, little-endian)
        view.setUint32(0, messageCounter, true);

        // Write node ID if provided (8 bytes, little-endian)
        if (nodeId !== undefined) {
            view.setBigUint64(5, nodeId, true);
        }

        return nonce;
    }
}
```

**Refactor Sessions**:

```typescript
// Before: /packages/protocol/src/session/NodeSession.ts
encode(payload: Bytes): Bytes {
    const nonce = this.#generateNonce();
    return Crypto.encrypt(this.encryptionKey, payload, nonce, ...);
}

#generateNonce(): Bytes {
    // ... 10+ lines of nonce generation
}

// After:
import { SessionCrypto } from "./SessionCrypto.js";

encode(payload: Bytes): Bytes {
    return SessionCrypto.encode(
        this.encryptionKey,
        payload,
        this.messageCounter,
        this.nodeId
    );
}
```

**Testing**:
- Unit tests for `SessionCrypto`
- Test nonce generation consistency
- Test encryption/decryption round-trip
- Verify compatibility with existing sessions
- Performance tests

**Files to Refactor**:
1. `session/NodeSession.ts:236-269`
2. `session/GroupSession.ts:125-216`

---

### 2.5 Create BDX Schema Factory

**Files Affected**: 5+ schema classes
**Lines Saved**: ~75
**Effort**: 6-8 hours

**Implementation**:

```typescript
// File: /packages/protocol/src/bdx/schema/SimpleSchemaFactory.ts
import { Schema } from "#types";
import { DataReader, DataWriter, Endian } from "#general";
import { Bytes } from "#general";

type FieldType = 'UInt8' | 'UInt16' | 'UInt32' | 'UInt64' | 'ByteArray';

interface FieldDefinition<T> {
    key: keyof T;
    type: FieldType;
    /** Optional length for ByteArray type */
    length?: number;
}

/**
 * Creates a simple schema for BDX messages with automatic encoding/decoding.
 * Eliminates boilerplate for schemas with primitive field types.
 */
export function createSimpleSchema<T extends Record<string, any>>(
    fields: FieldDefinition<T>[]
): new () => Schema<T> {
    return class SimpleSchema extends Schema<T> {
        encodeInternal(message: T): Bytes {
            const writer = new DataWriter(Endian.Little);

            for (const { key, type, length } of fields) {
                const value = message[key];

                if (type === 'ByteArray') {
                    if (length && value.length !== length) {
                        throw new Error(`Expected ${length} bytes for ${String(key)}, got ${value.length}`);
                    }
                    writer.writeByteArray(value);
                } else {
                    writer[`write${type}`](value);
                }
            }

            return writer.toByteArray();
        }

        decodeInternal(bytes: Bytes): T {
            const reader = new DataReader(bytes, Endian.Little);
            const result: any = {};

            for (const { key, type, length } of fields) {
                if (type === 'ByteArray') {
                    result[key] = reader.readByteArray(length);
                } else {
                    result[key] = reader[`read${type}`]();
                }
            }

            return result as T;
        }
    };
}
```

**Refactor Schemas**:

```typescript
// Before: /packages/protocol/src/bdx/schema/BdxBlockMessagesSchema.ts
export class BdxCounterOnlyMessageSchema extends Schema<BdxCounterOnly> {
    encodeInternal(message: BdxCounterOnly) {
        const { blockCounter } = message;
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(blockCounter);
        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): BdxCounterOnly {
        const reader = new DataReader(bytes, Endian.Little);
        return { blockCounter: reader.readUInt32() };
    }
}

// After:
import { createSimpleSchema } from "./SimpleSchemaFactory.js";

export const BdxCounterOnlyMessageSchema = createSimpleSchema<BdxCounterOnly>([
    { key: 'blockCounter', type: 'UInt32' }
]);
```

```typescript
// Before: BdxBlockQueryWithSkipMessageSchema (2 fields)
export class BdxBlockQueryWithSkipMessageSchema extends Schema<BdxBlockQueryWithSkip> {
    encodeInternal(message: BdxBlockQueryWithSkip) {
        const { blockCounter, bytesToSkip } = message;
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(blockCounter);
        writer.writeUInt64(bytesToSkip);
        return writer.toByteArray();
    }
    decodeInternal(bytes: Bytes): BdxBlockQueryWithSkip {
        const reader = new DataReader(bytes, Endian.Little);
        return {
            blockCounter: reader.readUInt32(),
            bytesToSkip: reader.readUInt64(),
        };
    }
}

// After:
export const BdxBlockQueryWithSkipMessageSchema = createSimpleSchema<BdxBlockQueryWithSkip>([
    { key: 'blockCounter', type: 'UInt32' },
    { key: 'bytesToSkip', type: 'UInt64' }
]);
```

**Testing**:
- Unit tests for `createSimpleSchema()`
- Test encoding/decoding for all field types
- Test error handling for invalid data
- Regression tests for all BDX schemas
- Performance comparison with manual implementation

**Schemas to Refactor**:
1. `BdxCounterOnlyMessageSchema`
2. `BdxBlockQueryWithSkipMessageSchema`
3. `BdxBlockEofAckMessageSchema`
4. `BdxStatusMessageSchema`
5. Additional BDX schemas with simple field structures

---

## Phase 3: Generator Optimization (1 week)

**Objective**: Fix code generation to reduce output
**Target**: 334+ files, ~7,000+ lines saved
**Risk Level**: LOW (generated code)
**Testing Required**: Regenerate and test

### 3.1 Optimize Client.ts Template

**Files Affected**: 130+ Client.ts files
**Lines Saved**: ~2,080
**Effort**: 4-6 hours

**Current Generator Output** (16 lines per file):
```typescript
export const OnOffClientConstructor = ClientBehavior(OnOff.Complete);
export interface OnOffClient extends InstanceType<typeof OnOffClientConstructor> {}
export interface OnOffClientConstructor extends Identity<typeof OnOffClientConstructor> {}
export const OnOffClient: OnOffClientConstructor = OnOffClientConstructor;
```

**Optimized Generator Output** (8 lines per file):
```typescript
import { createClientBehavior } from "../utils/ClientBehaviorFactory.js";
import { OnOff } from "#types";

export const OnOffClient = createClientBehavior(OnOff.Complete);
export type OnOffClient = InstanceType<typeof OnOffClient>;
```

**Generator Changes**:
- Modify code generator template in `/support/codegen/`
- Create `ClientBehaviorFactory` utility if needed
- Regenerate all Client.ts files
- Verify type compatibility

**Testing**:
- Full test suite after regeneration
- Verify TypeScript compilation
- Check IDE autocomplete still works
- Verify no runtime behavior changes

---

### 3.2 Optimize Behavior.ts Template

**Files Affected**: 130+ Behavior.ts files
**Lines Saved**: ~1,000+
**Effort**: 6-8 hours

**Current Generator Output**:
```typescript
export const OnOffBehaviorConstructor = ClusterBehavior
    .withInterface<OnOffInterface>()
    .for(OnOff.Cluster);

export interface OnOffBehavior extends InstanceType<typeof OnOffBehaviorConstructor> {}

export namespace OnOffBehavior {
    export interface State extends InstanceType<typeof OnOffBehavior.State> {}
    export const State = OnOffBehaviorConstructor.State;
    export interface Events extends InstanceType<typeof OnOffBehavior.Events> {}
    export const Events = OnOffBehaviorConstructor.Events;
}

export interface OnOffBehaviorConstructor extends Identity<typeof OnOffBehaviorConstructor> {}
export const OnOffBehavior: OnOffBehaviorConstructor = OnOffBehaviorConstructor;
```

**Optimized Generator Output**:
```typescript
export const OnOffBehavior = ClusterBehavior
    .withInterface<OnOffInterface>()
    .for(OnOff.Cluster);

export type OnOffBehavior = InstanceType<typeof OnOffBehavior>;

export namespace OnOffBehavior {
    export type State = InstanceType<typeof OnOffBehavior.State>;
    export type Events = InstanceType<typeof OnOffBehavior.Events>;
}
```

**Generator Changes**:
- Simplify template to use type aliases instead of interface + const
- Remove redundant Identity interface pattern
- Regenerate all Behavior.ts files

**Testing**:
- Full type checking
- Verify no breaking changes to public API
- Test IDE support for autocomplete and navigation
- Regression tests

---

### 3.3 Create Device Factory Generators

**Files Affected**: 62 device files
**Lines Saved**: ~3,000+
**Effort**: 12-16 hours

**Strategy**:
1. Identify device patterns (lighting, sensor, switch, etc.)
2. Create factory functions for each pattern
3. Update generator to use factories for common patterns
4. Regenerate device definitions

**Example Factory**:

```typescript
// /packages/node/src/devices/utils/LightingDeviceFactory.ts
export function createLightingDevice(config: {
    name: string;
    deviceType: number;
    deviceRevision: number;
    hasLevelControl?: boolean;
    hasColorControl?: 'ColorTemperature' | 'Xy' | 'XyAndColorTemperature';
}) {
    const clusters = {
        Identify: BaseIdentifyServer.alter({
            commands: { triggerEffect: { optional: false } }
        }),
        Groups: BaseGroupsServer,
        ScenesManagement: BaseScenesManagementServer.alter({
            commands: { copyScene: { optional: false } }
        }),
        OnOff: BaseOnOffServer.with("Lighting"),
    };

    if (config.hasLevelControl) {
        clusters.LevelControl = BaseLevelControlServer
            .with("OnOff", "Lighting")
            .alter({
                attributes: {
                    currentLevel: { min: 1, max: 254 },
                    minLevel: { default: 1, min: 1, max: 2 },
                    maxLevel: { default: 254, min: 254, max: 255 }
                }
            });
    }

    if (config.hasColorControl) {
        // Add color control configuration...
    }

    return MutableEndpoint({
        name: config.name,
        deviceType: config.deviceType,
        deviceRevision: config.deviceRevision,
        requirements: { server: { mandatory: clusters } },
        behaviors: SupportedBehaviors(...Object.values(clusters))
    });
}
```

**Generator Changes**:
- Update device generator templates
- Use factories for lighting, sensor, and other common patterns
- Regenerate device files

**Testing**:
- Verify all devices still work correctly
- Integration tests for each device type
- Check device behavior compatibility

---

## Phase 4: Codec & Utilities (1-2 weeks)

**Objective**: Centralize codec patterns
**Target**: 21 files, ~250 lines saved
**Risk Level**: MEDIUM
**Testing Required**: Integration & unit tests

### 4.1 Create CodecHelpers Utility

**Files Affected**: 10+ codec files
**Lines Saved**: ~150
**Effort**: 8-10 hours

**Implementation**: See Category 4.1 in analysis document

**Testing**:
- Unit tests for CodecHelpers
- Integration tests for all codecs
- Performance benchmarks
- Verify no behavior changes

---

### 4.2 Create FlagUtils Utility

**Files Affected**: 3+ codec files
**Lines Saved**: ~50
**Effort**: 4-6 hours

**Implementation**: See Category 4.2 in analysis document

**Testing**:
- Unit tests for flag extraction
- Test with all flag combinations
- Verify correctness

---

### 4.3 Create MockSetupBuilder

**Files Affected**: 4 test files
**Lines Saved**: ~50
**Effort**: 4-6 hours

**Implementation**: See Category 5.1 in analysis document

**Testing**:
- Test mock setup/teardown
- Verify test isolation
- Check all mocks still work

---

## Testing Strategy

### Unit Testing
- Create unit tests for all new utilities and helpers
- Minimum 80% code coverage for new code
- Test edge cases and error conditions

### Integration Testing
- Test refactored servers in full integration scenarios
- Verify behavior unchanged from original
- Test with real Matter devices if possible

### Regression Testing
- Run full existing test suite after each phase
- Zero regressions allowed before proceeding
- Performance benchmarks must not degrade

### Type Checking
- Full TypeScript compilation with no errors
- Verify type inference still works correctly
- Test IDE autocomplete and navigation

---

## Risk Mitigation

### Code Reviews
- All refactoring PRs require 2+ reviews
- Focus on behavioral equivalence
- Check for unintended side effects

### Incremental Rollout
- Complete one phase before starting next
- Monitor for issues after each merge
- Be prepared to revert if problems occur

### Documentation
- Update comments and documentation
- Document new utilities and patterns
- Create migration guide for developers

### Backward Compatibility
- Maintain public API compatibility
- Deprecated old patterns with warnings before removal
- Provide compatibility shims if needed

---

## Success Metrics

### Quantitative
- [ ] 8,171+ lines of duplication eliminated
- [ ] 390+ files refactored or consolidated
- [ ] 0 test regressions
- [ ] 0 new TypeScript errors
- [ ] Performance neutral or improved

### Qualitative
- [ ] Code more maintainable
- [ ] Easier to add new behaviors/devices
- [ ] Reduced cognitive load for developers
- [ ] Better separation of concerns
- [ ] Improved testability

---

## Timeline

| Phase | Duration | Effort | Completion |
|-------|----------|--------|------------|
| Phase 1: Quick Wins | 1-2 weeks | 40-50 hours | ☐ |
| Phase 2: Semantic Consolidation | 2-3 weeks | 80-100 hours | ☐ |
| Phase 3: Generator Optimization | 1 week | 40-50 hours | ☐ |
| Phase 4: Codec & Utilities | 1-2 weeks | 40-50 hours | ☐ |
| **Total** | **5-8 weeks** | **200-250 hours** | ☐ |

---

## Next Steps

1. Review this document with team
2. Prioritize phases based on business needs
3. Assign ownership for each phase
4. Create tracking issues/tickets
5. Begin Phase 1 implementation

See [QUICK_WINS.md](./QUICK_WINS.md) for immediate action items to get started.
