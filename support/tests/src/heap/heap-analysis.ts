/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IHeapEdge, IHeapNode, IHeapSnapshot } from "@memlab/core";
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

interface RetentionPathEntry {
    nodeId: number;
    nodeName: string;
    path: string[];
}

interface HeapReport {
    summary: { nodes: number; edges: number; totalShallowSize: number };
    byConstructor: ConstructorEntry[];
    byType: TypeEntry[];
    largeObjects: LargeObjectEntry[];
    closures: ClosureEntry[];
    retentionPaths: Record<string, RetentionPathEntry[]>;
}

/**
 * Analyze a heap snapshot and write a JSON report.
 */
export interface AnalyzeHeapOptions {
    /**
     * Trace retention paths for instances of these constructor names.  Up to 3 instances of each type are traced back
     * to GC roots via BFS.
     */
    trackedTypes?: string[];
}

export async function analyzeHeap(
    snapshotPath: string,
    outputDir: string,
    options?: AnalyzeHeapOptions,
): Promise<void> {
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
        retentionPaths: {},
    };

    // Trace retention paths for specific types of interest
    const trackedTypes = options?.trackedTypes;
    const retentionPaths: Record<string, RetentionPathEntry[]> = {};

    for (const typeName of trackedTypes ?? []) {
        // Collect all matching nodes, then sample evenly to get diverse retention paths
        const matchingNodes: IHeapNode[] = [];
        heap.nodes.forEach((node: IHeapNode) => {
            if (node.type === "object" && node.name === typeName) {
                matchingNodes.push(node);
            }
        });

        // Categorize by direct referrer types
        const referrerCategories = new Map<string, number>();
        for (const node of matchingNodes) {
            const referrers: IHeapEdge[] = node.referrers;
            const category = referrers
                .filter((e: IHeapEdge) => e.type !== "weak" && e.fromNode)
                .map((e: IHeapEdge) => `.${e.name_or_index}[${e.type}] from ${e.fromNode.name}(${e.fromNode.type})`)
                .join("; ");
            referrerCategories.set(category, (referrerCategories.get(category) ?? 0) + 1);
        }

        // Log categories
        const sorted = [...referrerCategories.entries()].sort((a, b) => b[1] - a[1]);
        const entries: RetentionPathEntry[] = [];
        entries.push({
            nodeId: 0,
            nodeName: `${matchingNodes.length} total instances`,
            path: sorted.slice(0, 20).map(([cat, count]) => `${count}x: ${cat}`),
        });

        // Also trace a few non-module instances for deeper analysis
        let tracedCount = 0;
        for (const node of matchingNodes) {
            if (tracedCount >= 5) break;
            const referrers: IHeapEdge[] = node.referrers;
            const isModule = referrers.some(
                (e: IHeapEdge) => e.fromNode?.type === "hidden" && e.fromNode?.name?.includes("SourceTextModule"),
            );
            if (!isModule) {
                const path = traceRetentionPath(node, 20);
                entries.push({ nodeId: node.id, nodeName: node.name, path });
                tracedCount++;
            }
        }

        if (entries.length > 0) {
            retentionPaths[typeName] = entries;
        }
    }

    report.retentionPaths = retentionPaths;

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "heap-analysis.json"), JSON.stringify(report, null, 2) + "\n");
}

interface DeltaConstructorEntry {
    name: string;
    count: number;
    shallowSize: number;
    retainedSize: number;
    countPerDevice: number;
    shallowPerDevice: number;
    retainedPerDevice: number;
}

interface DeltaClosureEntry {
    name: string;
    count: number;
    retainedSize: number;
    countPerDevice: number;
    retainedPerDevice: number;
}

interface DeltaRetentionEntry {
    type: string;
    instances: number;
    sampled: number;
    referrerCategories: Array<{ category: string; count: number }>;
    paths: RetentionPathEntry[];
}

interface HeapDeltaReport {
    deviceCount: number;
    summary: {
        newNodes: number;
        newShallowSize: number;
        nodesPerDevice: number;
        shallowPerDevice: number;
    };
    byConstructor: DeltaConstructorEntry[];
    closures: DeltaClosureEntry[];
    retention: Record<string, DeltaRetentionEntry>;
}

/**
 * Compare two heap snapshots and report objects that are new in the second snapshot.  Uses V8's monotonically
 * increasing node IDs — any node in snapshot2 whose ID exceeds the maximum ID in snapshot1 was allocated after
 * snapshot1 was taken.
 */
export interface AnalyzeHeapDeltaOptions {
    /**
     * Constructor names (for objects) or closure names to trace retention paths for.  Traces up to 5 instances of each.
     */
    trackedTypes?: string[];
}

export async function analyzeHeapDelta(
    baselinePath: string,
    finalPath: string,
    deviceCount: number,
    outputDir: string,
    options?: AnalyzeHeapDeltaOptions,
): Promise<void> {
    const baseline: IHeapSnapshot = await getFullHeapFromFile(baselinePath);

    // Find max node ID in baseline
    let maxBaselineId = 0;
    baseline.nodes.forEach((node: IHeapNode) => {
        if (node.id > maxBaselineId) {
            maxBaselineId = node.id;
        }
    });

    const final: IHeapSnapshot = await getFullHeapFromFile(finalPath);

    // Collect only nodes that are new (allocated after baseline)
    let newNodes = 0;
    let newShallowSize = 0;
    const constructors = new Map<string, { count: number; shallowSize: number; retainedSize: number }>();
    const closureMap = new Map<string, { count: number; retainedSize: number }>();

    const trackedTypes = new Set(options?.trackedTypes);
    const trackedNodes = new Map<string, IHeapNode[]>();

    final.nodes.forEach((node: IHeapNode) => {
        if (node.id <= maxBaselineId) {
            return;
        }

        newNodes++;
        newShallowSize += node.self_size;

        if (node.type === "object") {
            const entry = constructors.get(node.name);
            if (entry) {
                entry.count++;
                entry.shallowSize += node.self_size;
                entry.retainedSize += node.retainedSize;
            } else {
                constructors.set(node.name, {
                    count: 1,
                    shallowSize: node.self_size,
                    retainedSize: node.retainedSize,
                });
            }

            if (trackedTypes.has(node.name)) {
                let list = trackedNodes.get(node.name);
                if (!list) {
                    list = [];
                    trackedNodes.set(node.name, list);
                }
                list.push(node);
            }
        }

        if (node.type === "closure") {
            const entry = closureMap.get(node.name);
            if (entry) {
                entry.count++;
                entry.retainedSize += node.retainedSize;
            } else {
                closureMap.set(node.name, { count: 1, retainedSize: node.retainedSize });
            }

            // Track anonymous closures too
            const closureKey = node.name ? `closure:${node.name}` : "closure:(anonymous)";
            if (trackedTypes.has(closureKey)) {
                let list = trackedNodes.get(closureKey);
                if (!list) {
                    list = [];
                    trackedNodes.set(closureKey, list);
                }
                list.push(node);
            }
        }
    });

    const byConstructor: DeltaConstructorEntry[] = Array.from(constructors.entries())
        .map(([name, entry]) => ({
            name,
            ...entry,
            countPerDevice: Math.round((entry.count / deviceCount) * 10) / 10,
            shallowPerDevice: Math.round(entry.shallowSize / deviceCount),
            retainedPerDevice: Math.round(entry.retainedSize / deviceCount),
        }))
        .sort((a, b) => b.shallowSize - a.shallowSize)
        .slice(0, 80);

    const closures: DeltaClosureEntry[] = Array.from(closureMap.entries())
        .map(([name, entry]) => ({
            name,
            ...entry,
            countPerDevice: Math.round((entry.count / deviceCount) * 10) / 10,
            retainedPerDevice: Math.round(entry.retainedSize / deviceCount),
        }))
        .sort((a, b) => b.retainedSize - a.retainedSize)
        .slice(0, 50);

    // Trace retention paths for tracked types
    const retention: Record<string, DeltaRetentionEntry> = {};

    for (const [typeName, nodes] of trackedNodes) {
        // Categorize by referrer pattern
        const referrerCategories = new Map<string, { count: number; retainedSize: number }>();
        for (const node of nodes) {
            const referrers: IHeapEdge[] = node.referrers;
            const category = referrers
                .filter((e: IHeapEdge) => e.type !== "weak" && e.fromNode)
                .map(
                    (e: IHeapEdge) =>
                        `.${e.name_or_index}[${e.type}] from ${e.fromNode.name}(${e.fromNode.type})`,
                )
                .sort()
                .join("; ");
            const entry = referrerCategories.get(category);
            if (entry) {
                entry.count++;
                entry.retainedSize += node.retainedSize;
            } else {
                referrerCategories.set(category, { count: 1, retainedSize: node.retainedSize });
            }
        }

        const sortedCategories = [...referrerCategories.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20)
            .map(([category, { count, retainedSize }]) => ({ category, count, retainedSize }));

        // Sample up to 5 instances spread across the set for path tracing
        const sampleIndices: number[] = [];
        const step = Math.max(1, Math.floor(nodes.length / 5));
        for (let i = 0; i < nodes.length && sampleIndices.length < 5; i += step) {
            sampleIndices.push(i);
        }

        const paths: RetentionPathEntry[] = [];
        for (const idx of sampleIndices) {
            const node = nodes[idx];
            const path = traceRetentionPath(node, 25);
            paths.push({ nodeId: node.id, nodeName: node.name, path });
        }

        retention[typeName] = {
            type: typeName,
            instances: nodes.length,
            sampled: paths.length,
            referrerCategories: sortedCategories,
            paths,
        };
    }

    const report: HeapDeltaReport = {
        deviceCount,
        summary: {
            newNodes,
            newShallowSize,
            nodesPerDevice: Math.round(newNodes / deviceCount),
            shallowPerDevice: Math.round(newShallowSize / deviceCount),
        },
        byConstructor,
        closures,
        retention,
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "heap-delta.json"), JSON.stringify(report, null, 2) + "\n");
}

/**
 * Trace the shortest retention path from a node back to a GC root using BFS.
 * Avoids cycles by tracking visited nodes.
 */
function traceRetentionPath(target: IHeapNode, maxDepth: number): string[] {
    // BFS from target node back through referrers to find shortest path to a root
    interface BfsEntry {
        node: IHeapNode;
        edge?: IHeapEdge;
        parent?: BfsEntry;
        depth: number;
    }

    const visited = new Set<number>();
    visited.add(target.id);

    const queue: BfsEntry[] = [{ node: target, depth: 0 }];
    let found: BfsEntry | undefined;

    while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.depth >= maxDepth) continue;

        const referrers: IHeapEdge[] = entry.node.referrers;
        if (!referrers || referrers.length === 0) {
            found = entry;
            break;
        }

        for (const edge of referrers) {
            const from = edge.fromNode;
            if (!from || visited.has(from.id)) continue;
            // Skip weak references
            if (edge.type === "weak") continue;
            visited.add(from.id);

            const child: BfsEntry = { node: from, edge, parent: entry, depth: entry.depth + 1 };

            if (from.name === "(GC roots)" || from.name === "(Internals)") {
                found = child;
                break;
            }

            queue.push(child);
        }

        if (found) break;
    }

    if (!found) {
        // If we couldn't find a GC root, just show the target info and all referrers
        const result = [`${target.name}(${target.type}, id=${target.id})`];
        const referrers = target.referrers.filter(
            (e: IHeapEdge) => e.fromNode && e.fromNode.id !== target.id && e.type !== "weak",
        );
        result.push(
            `referrers(${referrers.length}): ${referrers
                .slice(0, 10)
                .map((e: IHeapEdge) => `.${e.name_or_index}[${e.type}] from ${e.fromNode.name}(id=${e.fromNode.id})`)
                .join(", ")}`,
        );
        return result;
    }

    // Reconstruct path from target to root
    const path: string[] = [];
    let cur: BfsEntry | undefined = found;
    while (cur) {
        if (cur.edge) {
            path.push(
                `<- .${cur.edge.name_or_index} [${cur.edge.type}] from ${cur.node.name}(${cur.node.type}, id=${cur.node.id})`,
            );
        } else {
            path.push(`${cur.node.name}(${cur.node.type}, id=${cur.node.id})`);
        }
        cur = cur.parent;
    }

    return path.reverse();
}
