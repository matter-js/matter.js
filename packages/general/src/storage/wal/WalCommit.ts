/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageError } from "../StorageDriver.js";
import { type SupportedStorageTypes, fromJson, toJson } from "../StringifyTools.js";

export type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * A single operation within a WAL commit.
 */
export type WalOp =
    | { op: "upd"; key: string; values: Record<string, SupportedStorageTypes> }
    | { op: "del"; key: string; values?: string[] };

/**
 * A commit is a timestamped array of operations serialized as one WAL line.
 */
export interface WalCommit {
    /**
     * Millis since Unix epoch when the commit was written.
     */
    ts: number;

    /**
     * The operations in this commit.
     */
    ops: WalOp[];
}

/**
 * 48-bit commit ID: high 32 bits = segment number, low 16 bits = line offset.
 *
 * The offset is the line's position in the segment file, counting every line, as `WalReader` reads it.
 */
export type WalCommitId = {
    segment: number;
    offset: number;
};

/** Maximum segment number (32-bit). */
export const MAX_SEGMENT = 0xffffffff;

/** Maximum line offset within a single segment (16-bit). */
export const MAX_SEGMENT_LINES = 0xffff;

/**
 * Encode context array to a `/`-delimited key, URL-encoding `%` and `/` in each segment.
 */
export function encodeContextKey(contexts: string[]): string {
    return contexts.map(s => s.replace(/%/g, "%25").replace(/\//g, "%2F")).join("/");
}

/**
 * Decode a `/`-delimited context key back to a context array.
 */
export function decodeContextKey(key: string): string[] {
    return key.split("/").map(s => s.replace(/%2F/gi, "/").replace(/%25/g, "%"));
}

/**
 * Serialize a commit to a JSON line for the WAL.
 */
export function serializeCommit(commit: WalCommit): string {
    const value: SupportedStorageTypes = { ts: commit.ts, ops: commit.ops };
    return toJson(value);
}

/**
 * Deserialize a JSON line back to a commit.
 *
 * Handles legacy bare-array format by wrapping as `{ ts: 0, ops }`.
 *
 * Throws if the parsed value is not a structurally valid commit so callers
 * (e.g. {@link WalReader}) can skip the line rather than yielding a commit
 * that crashes replay downstream.
 */
export function deserializeCommit(line: string): WalCommit {
    const parsed: unknown = fromJson(line);

    if (Array.isArray(parsed)) {
        parsed.forEach(validateOp);
        return { ts: 0, ops: parsed as WalOp[] };
    }

    if (!isPlainRecord(parsed)) {
        throw new StorageError("WAL commit is not an object");
    }
    const { ts, ops } = parsed;
    if (typeof ts !== "number") {
        throw new StorageError("WAL commit `ts` is missing or not a number");
    }
    if (!Array.isArray(ops)) {
        throw new StorageError("WAL commit `ops` is missing or not an array");
    }
    ops.forEach(validateOp);
    return { ts, ops: ops as WalOp[] };
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateOp(op: unknown, index: number): void {
    if (!isPlainRecord(op)) {
        throw new StorageError(`WAL op[${index}] is not an object`);
    }
    const { op: kind, key, values } = op;
    if (typeof key !== "string") {
        throw new StorageError(`WAL op[${index}] \`key\` is not a string`);
    }
    if (kind === "upd") {
        if (!isPlainRecord(values)) {
            throw new StorageError(`WAL op[${index}] upd \`values\` is not an object`);
        }
        return;
    }
    if (kind === "del") {
        if (values === undefined) {
            return;
        }
        if (!Array.isArray(values) || !values.every(v => typeof v === "string")) {
            throw new StorageError(`WAL op[${index}] del \`values\` is not a string array`);
        }
        return;
    }
    throw new StorageError(`WAL op[${index}] has unknown op kind \`${String(kind)}\``);
}

/**
 * Combine a commit ID into a single number (48-bit safe in JS).
 */
export function commitIdToNumber(id: WalCommitId): number {
    return id.segment * 0x10000 + id.offset;
}

/**
 * Compare two commit IDs.  Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareCommitIds(a: WalCommitId, b: WalCommitId): number {
    if (a.segment !== b.segment) {
        return a.segment - b.segment;
    }
    return a.offset - b.offset;
}
