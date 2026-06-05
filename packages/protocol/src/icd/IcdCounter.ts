/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, ObservableValue } from "@matter/general";

/**
 * Counter advance applied on every boot.
 *
 * Chosen to exceed the number of check-ins plausibly sent between persists. With write-through persistence a small
 * constant suffices; the spec example uses 1000.
 *
 * @see {@link MatterSpecification.v151.Core} § 4.6.3
 */
const BOOT_BUMP = 100;

/**
 * Runtime ICD check-in counter (ICDCounter attribute, quality C N).
 *
 * The owner seeds this counter from the persisted attribute value at node init, persists {@link counter}.value, and
 * persists every subsequent emission. On each boot the counter advances by {@link BOOT_BUMP} so that a crash between
 * an increment and its persist can never cause a counter value to be reused.
 *
 * uint32 wrap-around is harmless: clients apply mod-2³² offset arithmetic and refresh their keys before the offset
 * reaches 2³¹.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16.6.5 (ICDCounter attribute)
 * @see {@link MatterSpecification.v151.Core} § 4.6.3 (Check-In Counter — boot-bump persistence strategy)
 */
export class IcdCounter {
    #counter?: ObservableValue<[value: number]>;

    /**
     * The observable counter value. Read `.value` for the current count, observe for changes.
     *
     * @throws {ImplementationError} if accessed before {@link seed}.
     */
    get counter(): ObservableValue<[value: number]> {
        if (this.#counter === undefined) {
            throw new ImplementationError("IcdCounter used before seeding");
        }
        return this.#counter;
    }

    /** True once {@link seed} has been called. */
    get isSeeded(): boolean {
        return this.#counter !== undefined;
    }

    /**
     * Seeds the counter from the persisted attribute value and applies the boot bump.
     *
     * @throws {ImplementationError} if called more than once.
     */
    seed(persistedValue: number): void {
        if (this.#counter !== undefined) {
            throw new ImplementationError("IcdCounter already seeded");
        }
        this.#counter = ObservableValue<[value: number]>((persistedValue + BOOT_BUMP) >>> 0);
    }

    /**
     * Advances the counter by one (uint32 wrap-around) and emits {@link counter}.
     *
     * @returns the new counter value.
     * @throws {ImplementationError} if called before {@link seed}.
     */
    increment(): number {
        const counter = this.counter;
        const next = (counter.value! + 1) >>> 0;
        counter.emit(next);
        return next;
    }
}
