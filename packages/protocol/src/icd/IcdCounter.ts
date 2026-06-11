/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Observable } from "@matter/general";

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
 * The owner constructs this from the persisted attribute value, persists {@link value} once, then persists every
 * {@link changed} emission. The persisted value is advanced by {@link BOOT_BUMP} on construction so a crash between an
 * increment and its persist can never cause a counter value to be reused.
 *
 * uint32 wrap-around is harmless: clients apply mod-2³² offset arithmetic and refresh their keys before the offset
 * reaches 2³¹.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16.6.5 (ICDCounter attribute)
 * @see {@link MatterSpecification.v151.Core} § 4.6.3 (Check-In Counter — boot-bump persistence strategy)
 */
export class IcdCounter {
    #value: number;

    /** Emits the new counter value after every {@link increment}. */
    readonly changed = Observable<[value: number]>();

    /**
     * Random initial counter value for a factory-reset device: a 28-bit DRBG value plus one (range 1 … 2²⁸).
     * Randomizing the start widens the counter space traversed before key refresh and avoids cross-device counter
     * correlation, since the counter is bound into the Check-In AES-CCM nonce together with the ICD key.
     *
     * @see {@link MatterSpecification.v151.Core} § 4.6.1.1 (Message Counter Initialization)
     * @see {@link MatterSpecification.v151.Core} § 4.6.3 (Check-In Counter — randomize on factory reset)
     */
    static randomInitialValue(crypto: Crypto): number {
        return (crypto.randomUint32 >>> 4) + 1;
    }

    constructor(persistedValue: number) {
        this.#value = (persistedValue + BOOT_BUMP) >>> 0;
    }

    /** Current counter value. */
    get value(): number {
        return this.#value;
    }

    /**
     * Advances the counter by one (uint32 wrap-around) and emits {@link changed}.
     *
     * @returns the new counter value.
     */
    increment(): number {
        this.#value = (this.#value + 1) >>> 0;
        this.changed.emit(this.#value);
        return this.#value;
    }
}
