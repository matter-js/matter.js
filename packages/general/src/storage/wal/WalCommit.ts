/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SupportedStorageTypes, fromJson, toJson } from "../StringifyTools.js";

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
 */
export interface WalCommitId {
    segment: number;
    offset: number;
}

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
    return toJson({ ts: commit.ts, ops: commit.ops } as unknown as SupportedStorageTypes);
}

/**
 * Deserialize a JSON line back to a commit.
 *
 * Handles legacy bare-array format by wrapping as `{ ts: 0, ops }`.
 */
export function deserializeCommit(line: string): WalCommit {
    const parsed = fromJson(line);
    if (Array.isArray(parsed)) {
        return { ts: 0, ops: parsed as WalOp[] };
    }
    return parsed as unknown as WalCommit;
}

/**
 * Format a segment number as an 8-digit hex filename with `.jsonl` extension.
 */
export function segmentFilename(segment: number): string {
    return segment.toString(16).padStart(8, "0") + ".jsonl";
}

/**
 * Format a segment number as a compressed segment filename.
 */
export function compressedSegmentFilename(segment: number): string {
    return segment.toString(16).padStart(8, "0") + ".jsonl.gz";
}

/**
 * Returns true if the filename is a gzip-compressed segment file.
 */
export function isCompressedSegmentFile(name: string): boolean {
    return /^[0-9a-f]{8}\.jsonl\.gz$/i.test(name);
}

/**
 * Parse a segment number from a filename.  Returns undefined if not a valid segment file.
 */
export function parseSegmentFilename(name: string): number | undefined {
    const match = name.match(/^([0-9a-f]{8})\.jsonl(\.gz)?$/i);
    if (!match) {
        return undefined;
    }
    return parseInt(match[1], 16);
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
