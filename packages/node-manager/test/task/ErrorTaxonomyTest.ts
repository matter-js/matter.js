/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as errors from "#task/errors.js";
import {
    RotationPreconditionError,
    TaskAbandonedError,
    TaskAbandonedSignal,
    TaskAlreadyUndoneError,
    TaskCancelledSignal,
    TaskCannotCancelRollbackError,
    TaskCapacityExceededError,
    TaskConflictError,
    TaskExternalIdInUseError,
    TaskFailedError,
    TaskFindingCode,
    TaskIdentityExhaustedError,
    TaskManagerClosingError,
    TaskNotARollbackError,
    TaskNotFoundError,
    TaskNotRevertibleError,
    TaskPeerUnavailableError,
    TaskRefusedError,
    TaskRollbackPendingError,
    TaskSlotAwaitingResumeError,
    TaskSlotDrainingError,
    TaskSlotOccupiedError,
    TaskSlotSettlingError,
    TaskSupersededError,
    TaskSuspendedSignal,
    TaskTypeNotRegisteredError,
} from "#task/errors.js";
import { RunId } from "#task/types.js";

const OWNER = RunId(7);

/**
 * The one place the class-to-code mapping is pinned. Every other test asserts the class it expects, which says
 * nothing about the code a caller switches on: a code assigned to the wrong class would leave all of them green.
 */
const CODES: Array<[TaskRefusedError, TaskFindingCode]> = [
    [new TaskSlotOccupiedError("", OWNER), TaskFindingCode.SlotOccupied],
    [new TaskSlotDrainingError("", OWNER), TaskFindingCode.SlotDraining],
    [new TaskSlotSettlingError("", OWNER), TaskFindingCode.SlotSettling],
    [new TaskSlotAwaitingResumeError("", OWNER), TaskFindingCode.SlotAwaitingResume],
    [new TaskExternalIdInUseError("", OWNER), TaskFindingCode.ExternalIdInUse],
    [new TaskRollbackPendingError("", OWNER), TaskFindingCode.RollbackPending],
    [new TaskSupersededError("", OWNER), TaskFindingCode.Superseded],
    [new TaskNotFoundError(""), TaskFindingCode.NotFound],
    [new TaskTypeNotRegisteredError(""), TaskFindingCode.TypeNotRegistered],
    [new TaskNotRevertibleError(""), TaskFindingCode.NotRevertible],
    [new TaskManagerClosingError(""), TaskFindingCode.ManagerClosing],
    [new TaskIdentityExhaustedError(""), TaskFindingCode.IdentityExhausted],
    [new TaskNotARollbackError(""), TaskFindingCode.NotARollback],
    [new TaskAlreadyUndoneError(""), TaskFindingCode.AlreadyUndone],
    [new TaskAbandonedError(""), TaskFindingCode.Abandoned],
    [new TaskCannotCancelRollbackError(""), TaskFindingCode.CannotCancelRollback],
];

describe("task error taxonomy", () => {
    it("gives every refusal its own code", () => {
        for (const [error, code] of CODES) {
            expect(error.code).equals(code);
        }
        // Distinct, so a caller switching on the code can tell the refusals apart.
        expect(new Set(CODES.map(([, code]) => code)).size).equals(CODES.length);
        // And exhaustive both ways, so neither a code without a class nor a class without an entry here can be
        // added silently. Walking the module is what catches the second: a new class reusing an existing code
        // satisfies the count and the distinctness check on its own.
        expect(CODES.length).equals(Object.keys(TaskFindingCode).length);
        const named = new Set(CODES.map(([error]) => error.constructor.name));
        for (const [name, exported] of Object.entries(errors)) {
            if (typeof exported !== "function" || !(exported.prototype instanceof TaskRefusedError)) {
                continue;
            }
            // The two abstract bases carry no code of their own and cannot be constructed.
            if (name === "TaskConflictError") {
                continue;
            }
            expect(named).contains(name);
        }
    });

    it("names the run a contention refusal is about", () => {
        // Required, not optional: a field every producer sets is a field every caller has to guard for nothing.
        for (const [error] of CODES) {
            if (error instanceof TaskConflictError) {
                expect(error.owner).equals(OWNER);
            }
        }
    });

    it("carries a code on refusals only", () => {
        // An error that ends a run, or stops a driver, is not answering a caller's request.
        for (const notARefusal of [
            new TaskFailedError(""),
            new TaskCapacityExceededError(""),
            new TaskPeerUnavailableError(""),
            new RotationPreconditionError(""),
            new TaskCancelledSignal(""),
            new TaskAbandonedSignal(""),
            new TaskSuspendedSignal(""),
        ]) {
            expect(notARefusal).not.instanceOf(TaskRefusedError);
        }
    });
});
