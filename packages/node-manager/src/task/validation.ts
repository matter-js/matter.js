/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, UINT64_MAX } from "@matter/general";
import { MATTER_EPOCH_OFFSET_US } from "@matter/types";

/**
 * Checks a task definition applies to the parameters it is handed.
 *
 * These throw {@link ImplementationError} because a caller passing the wrong shape to `run()` has made a
 * programming mistake. The same check also runs against parameters read back from storage, where it is not
 * the caller's mistake — so the verbs that bind a stored record wrap it in a coded refusal instead.
 */
export const Require = {
    /** An unsigned integer within `max`, inclusive. */
    uint(field: string, value: unknown, max: number): void {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
            throw new ImplementationError(`"${field}" must be an integer in 0..${max}, not ${describe(value)}`);
        }
    },

    /** A byte array of exactly `length` bytes. */
    bytes(field: string, value: unknown, length: number): void {
        if (!(value instanceof Uint8Array)) {
            throw new ImplementationError(`"${field}" must be a Uint8Array, not ${describe(value)}`);
        }
        if (value.length !== length) {
            throw new ImplementationError(`"${field}" must be ${length} bytes, not ${value.length}`);
        }
    },

    /**
     * A string of at most `max` characters, where the cluster constrains its length.
     *
     * Empty is a value, not an omission: Groups requires the empty string as the name of a group that has
     * none, so refusing it would leave a caller unable to say so explicitly.
     */
    label(field: string, value: unknown, max: number): void {
        if (typeof value !== "string") {
            throw new ImplementationError(`"${field}" must be a string, not ${describe(value)}`);
        }
        if (value.length > max) {
            throw new ImplementationError(`"${field}" must be at most ${max} characters`);
        }
        // Only the code points before the first IS1 are a string's textual content, and a conformant
        // implementation never emits one, so the encoder refuses it — far from the caller that supplied it.
        if (value.includes("\u001f")) {
            throw new ImplementationError(`"${field}" must not contain an information separator`);
        }
    },

    /** A non-empty string. */
    text(field: string, value: unknown): void {
        if (typeof value !== "string" || value === "") {
            throw new ImplementationError(`"${field}" must be a non-empty string, not ${describe(value)}`);
        }
    },

    /**
     * A Unix time in microseconds the wire format can carry.
     *
     * `TlvEpochUs` subtracts the Matter epoch and refuses the result if it goes negative, so a value below
     * 2000-01-01 reaches the device path as an uncoded encode failure rather than as a refusal here.
     */
    epoch(field: string, value: unknown): void {
        if (typeof value !== "bigint") {
            throw new ImplementationError(`"${field}" must be a bigint, not ${describe(value)}`);
        }
        if (value < MATTER_EPOCH_OFFSET_US || value > UINT64_MAX + MATTER_EPOCH_OFFSET_US) {
            throw new ImplementationError(`"${field}" is not a Matter epoch time in microseconds`);
        }
    },

    /**
     * An identifier a group task may manage: like {@link uint}, but zero is not one.
     *
     * Group id 0 is "no group" — the Groups cluster constrains `AddGroup`/`RemoveGroup` to `min 1` — and group
     * key set 0 is the IPK, which commissioning owns and the reconciler refuses.
     */
    id(field: string, value: unknown, max: number): void {
        Require.uint(field, value, max);
        if (value === 0) {
            throw new ImplementationError(`"${field}" must not be 0`);
        }
    },

    /** One of the values the field's type defines. */
    oneOf(field: string, value: unknown, allowed: readonly unknown[]): void {
        if (!allowed.includes(value)) {
            throw new ImplementationError(`"${field}" must be one of ${allowed.join(", ")}, not ${describe(value)}`);
        }
    },

    /**
     * One entry of what a run changed: where it wrote, and the value to put back.
     *
     * The same rule for a caller's parameters and for a record read back from storage — a rollback replays
     * these, and the layer walks them while a run writes, so a malformed one fails far from here.
     */
    changeEntry(field: string, value: unknown): void {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new ImplementationError(`"${field}" must be a change entry, not ${describe(value)}`);
        }
        const entry = value as Record<string, unknown>;
        Require.text(`${field}.peerId`, entry.peerId);
        Require.text(`${field}.kind`, entry.kind);
        if (typeof entry.key !== "string") {
            throw new ImplementationError(`"${field}.key" must be a string`);
        }
        if (entry.prior === undefined) {
            return;
        }
        if (typeof entry.prior !== "object" || entry.prior === null || Array.isArray(entry.prior)) {
            throw new ImplementationError(`"${field}.prior" must be an object, not ${describe(entry.prior)}`);
        }
        const prior = entry.prior as Record<string, unknown>;
        // An entry with a prior restores a value; one without removes the item. A prior that carries no value
        // is neither, and would reach the device as an intent of `undefined`.
        if (prior.intent === undefined) {
            throw new ImplementationError(`"${field}.prior.intent" is missing`);
        }
        if (prior.mode !== "converge" && prior.mode !== "maintain") {
            throw new ImplementationError(`"${field}.prior.mode" must be "converge" or "maintain"`);
        }
    },

    /** An object with named fields, so a definition may read them at all. An array has none. */
    params(type: string, value: unknown): void {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new ImplementationError(`Parameters for task "${type}" must be an object, not ${describe(value)}`);
        }
    },
};

/**
 * Names a rejected value without reproducing it.
 *
 * Task parameters carry raw group keys, so a message that echoed the value would put key material into logs.
 * A bigint would also defeat `JSON.stringify` outright.
 */
function describe(value: unknown): string {
    if (value === null) {
        return "null";
    }
    if (value instanceof Uint8Array) {
        return `${value.length} bytes`;
    }
    return typeof value;
}
