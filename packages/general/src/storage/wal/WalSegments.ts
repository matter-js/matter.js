/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { Directory } from "../../fs/Directory.js";
import { Gzip } from "../../util/Gzip.js";
import { writeSynced } from "./WalFiles.js";

const logger = Logger.get("WalSegments");

/*
 * File layout of the `wal/` directory: one file per segment, named by its 8-digit hex number, `.jsonl` while it is
 * written and `.jsonl.gz` once compressed.  Compression writes `<segment>.jsonl.gz.tmp` and renames it into place.
 */

const SEGMENT_NAME = /^([0-9a-f]{8})\.jsonl(\.gz)?$/i;

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
 * Parse a segment number from a filename.  Returns undefined if not a valid segment file.
 */
export function parseSegmentFilename(name: string): number | undefined {
    const match = name.match(SEGMENT_NAME);
    return match ? parseInt(match[1], 16) : undefined;
}

/**
 * The files of one WAL segment.  Both exist for a moment while the segment is compressed; the compressed file is
 * renamed into place only once complete, so it wins.
 */
export interface WalSegment {
    segment: number;
    original?: string;
    compressed?: string;
}

/**
 * List the segments in {@link walDir}, ordered by segment number.  Returns an empty list if the directory does not
 * exist.
 */
export async function listSegments(walDir: Directory): Promise<WalSegment[]> {
    const segments = new Map<number, WalSegment>();
    if (!(await walDir.exists())) {
        return [];
    }
    for await (const entry of walDir.entries()) {
        if (entry.kind !== "file") continue;
        const match = entry.name.match(SEGMENT_NAME);
        if (match === null) continue;

        const segment = parseInt(match[1], 16);
        let files = segments.get(segment);
        if (files === undefined) {
            files = { segment };
            segments.set(segment, files);
        }
        if (match[2] === undefined) {
            files.original = entry.name;
        } else {
            files.compressed = entry.name;
        }
    }
    return [...segments.values()].sort((a, b) => a.segment - b.segment);
}

/**
 * Delete every segment numbered below {@link segment}, oldest first, with any temporary file a compression left.
 *
 * The caller passes the segment of the oldest snapshot that must stay restorable; that segment itself may hold later
 * commits the snapshot does not contain, so it is kept.
 */
export async function deleteSegmentsBefore(walDir: Directory, segment: number): Promise<void> {
    for (const files of await listSegments(walDir)) {
        if (files.segment >= segment) {
            break;
        }
        for (const name of [files.original, files.compressed, compressionTempFilename(files.segment)]) {
            if (name !== undefined) {
                await walDir.file(name).delete();
            }
        }
    }
}

/**
 * Compress every segment numbered below {@link segment} that has only its original file.  A segment that has both
 * files lost only the delete of its original in an earlier run, so only the original is deleted.
 *
 * Each segment is handled on its own; a failure is logged and the next segment is tried.
 */
export async function compressSegmentsBefore(
    walDir: Directory,
    segment: number,
    options: { fsync: boolean },
): Promise<void> {
    for (const files of await listSegments(walDir)) {
        if (files.segment >= segment) {
            break;
        }
        if (files.original === undefined) continue;

        try {
            const original = walDir.file(files.original);
            if (files.compressed === undefined) {
                const tmpFile = walDir.file(compressionTempFilename(files.segment));
                await writeSynced(tmpFile, Gzip.compress(original.readBytes()), options.fsync);
                await tmpFile.rename(compressedSegmentFilename(files.segment));
            }
            await original.delete();
        } catch (e) {
            logger.warn(`Failed to compress WAL segment ${files.segment} in ${walDir.path}:`, e);
        }
    }
}

function compressionTempFilename(segment: number) {
    return `${compressedSegmentFilename(segment)}.tmp`;
}
