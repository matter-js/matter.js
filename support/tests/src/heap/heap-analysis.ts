/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IHeapNode, IHeapSnapshot } from "@memlab/core";
import { getFullHeapFromFile } from "@memlab/heap-analysis";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface ConstructorEntry {
    name: string;
    count: number;
    shallowSize: number;
    retainedSize: number;
}

interface TypeEntry {
    type: string;
    count: number;
    shallowSize: number;
}

interface LargeObjectEntry {
    name: string;
    type: string;
    id: number;
    shallowSize: number;
    retainedSize: number;
}

interface ClosureEntry {
    name: string;
    count: number;
    retainedSize: number;
}

interface HeapReport {
    summary: { nodes: number; edges: number; totalShallowSize: number };
    byConstructor: ConstructorEntry[];
    byType: TypeEntry[];
    largeObjects: LargeObjectEntry[];
    closures: ClosureEntry[];
}

/**
 * Analyze a heap snapshot and write a JSON report.
 */
export async function analyzeHeap(snapshotPath: string, outputDir: string): Promise<void> {
    const heap: IHeapSnapshot = await getFullHeapFromFile(snapshotPath);

    let totalShallowSize = 0;
    const constructors = new Map<string, { count: number; shallowSize: number; retainedSize: number }>();
    const types = new Map<string, { count: number; shallowSize: number }>();
    const closureMap = new Map<string, { count: number; retainedSize: number }>();
    const largeObjects: LargeObjectEntry[] = [];

    // We need to track top 50 large objects by retained size.  Use a simple approach: collect all then sort.
    // For heaps with millions of nodes this is memory-intensive but workable for analysis tooling.

    heap.nodes.forEach((node: IHeapNode) => {
        const selfSize = node.self_size;
        const retainedSize = node.retainedSize;

        totalShallowSize += selfSize;

        // By type
        const typeEntry = types.get(node.type);
        if (typeEntry) {
            typeEntry.count++;
            typeEntry.shallowSize += selfSize;
        } else {
            types.set(node.type, { count: 1, shallowSize: selfSize });
        }

        // By constructor (object type nodes)
        if (node.type === "object") {
            const ctorEntry = constructors.get(node.name);
            if (ctorEntry) {
                ctorEntry.count++;
                ctorEntry.shallowSize += selfSize;
                ctorEntry.retainedSize += retainedSize;
            } else {
                constructors.set(node.name, { count: 1, shallowSize: selfSize, retainedSize: retainedSize });
            }
        }

        // Closures
        if (node.type === "closure") {
            const closureEntry = closureMap.get(node.name);
            if (closureEntry) {
                closureEntry.count++;
                closureEntry.retainedSize += retainedSize;
            } else {
                closureMap.set(node.name, { count: 1, retainedSize: retainedSize });
            }
        }

        // Track for large objects (we'll sort and trim later)
        if (retainedSize > 0) {
            largeObjects.push({
                name: node.name,
                type: node.type,
                id: node.id,
                shallowSize: selfSize,
                retainedSize: retainedSize,
            });
        }
    });

    // Sort large objects by retained size and keep top 50
    largeObjects.sort((a, b) => b.retainedSize - a.retainedSize);
    largeObjects.length = Math.min(largeObjects.length, 50);

    // Build constructor list sorted by retained size
    const byConstructor: ConstructorEntry[] = Array.from(constructors.entries())
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.retainedSize - a.retainedSize)
        .slice(0, 50);

    // Build type list sorted by shallow size
    const byType: TypeEntry[] = Array.from(types.entries())
        .map(([type, entry]) => ({ type, ...entry }))
        .sort((a, b) => b.shallowSize - a.shallowSize);

    // Build closure list sorted by retained size
    const closures: ClosureEntry[] = Array.from(closureMap.entries())
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.retainedSize - a.retainedSize);

    const report: HeapReport = {
        summary: {
            nodes: heap.nodes.length,
            edges: heap.edges.length,
            totalShallowSize,
        },
        byConstructor,
        byType,
        largeObjects,
        closures,
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "heap-analysis.json"), JSON.stringify(report, null, 2) + "\n");
}
