/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, UINT64_MAX } from "@matter/general";
import { PeerAddress } from "@matter/protocol";
import { FabricIndex, MATTER_EPOCH_OFFSET_US, NodeId } from "@matter/types";

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
     * Refused below 2000-01-01: `TlvEpochUs` subtracts the Matter epoch and refuses a negative result, so
     * without this check the value would reach the device path as an uncoded encode failure.
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

    /**
     * An endpoint a task can address.
     *
     * `0xffff` is the wildcard, not an endpoint: {@link EndpointNumber} stops at `0xfffe`, so accepting it
     * would admit a run that can never reach what it names.
     */
    endpoint(field: string, value: unknown): void {
        Require.uint(field, value, 0xfffe);
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
        Require.peerAddress(`${field}.peer`, entry.peer);
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

    /**
     * The identity of a peer or group: the one thing about a node that is never re-issued.
     *
     * A local node id is not that — it is free again once the node is removed — so nothing a record keeps may
     * be one.
     */
    peerAddress(field: string, value: unknown): void {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new ImplementationError(`"${field}" must be a peer address, not ${describe(value)}`);
        }
        const address = value as Record<string, unknown>;
        // The spec's own range, asked of the type that owns it: a fabric index outside 1..254 is a sentinel or
        // nothing, and a node id is a uint64. Either resolves to no peer, so a record carrying one would hold a
        // target nothing can ever drive.
        if (!FabricIndex.isValid(address.fabricIndex)) {
            throw new ImplementationError(`"${field}.fabricIndex" must be a fabric index`);
        }
        if (typeof address.nodeId !== "bigint" || address.nodeId < 0n || address.nodeId > UINT64_MAX) {
            throw new ImplementationError(`"${field}.nodeId" must be a node id`);
        }
        // A uint64 is not yet an address a peer can answer to: the reserved ranges — unspecified, the
        // temporary-local and CASE-authenticated-tag ids, PAKE subjects — name no commissioned node, so a
        // record carrying one holds a target nothing can ever drive. A group address is the one other thing
        // that resolves; `peer` refuses that separately, because the task decides which it accepts.
        const nodeId = NodeId(address.nodeId);
        if (!NodeId.isOperationalNodeId(nodeId) && !PeerAddress.isGroup({ fabricIndex: FabricIndex(1), nodeId })) {
            throw new ImplementationError(`"${field}.nodeId" must be an operational node id or a group address`);
        }
    },

    /**
     * The address of a node a task can drive: a peer, never a group.
     *
     * A group's address is a valid one — its node id carries the group id — and a group node is a
     * {@link ClientNode} like any other, so it reaches admission and then parks forever: a group has no
     * subscription to become reachable on. The tasks that provision a device refuse one at the door instead.
     */
    peer(field: string, value: unknown): void {
        Require.peerAddress(field, value);
        if (PeerAddress.isGroup(value as PeerAddress)) {
            throw new ImplementationError(`"${field}" is a group address, and this task drives a peer`);
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
