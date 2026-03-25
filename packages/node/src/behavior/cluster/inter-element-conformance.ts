/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, Conformance } from "@matter/model";
import type { NameDependentElements } from "./NameDependentElements.js";
import type { ValidatedElements } from "./ValidatedElements.js";

/**
 * Resolves element presence for conformance expressions that reference other sibling elements.
 *
 * Only processes elements in {@link NameDependentElements.interdependents} — elements whose conformance ASTs contain
 * actual sibling element name references that require dependency graph resolution.
 *
 * Algorithm:
 *
 * 1. Group initialization — each interdependent element starts in its own group.
 *
 * 2. Cycle detection — DFS through deps.  Cycles (e.g., Pause↔Resume) merge into single groups.  Already-resolved
 *    deps become leaf nodes.  Result: a DAG of groups.
 *
 * 3. Propagation (bottom-up) — for each group in reverse topological order:
 *    - If any dep group is present → this group is present
 *    - Otherwise use fallback: single-element groups apply their own fallback; cyclic groups are present only if ALL
 *      members are implemented
 *
 * 4. Validate — compare computed presence vs actual implementation:
 *    - Present + not implemented → error
 *    - Absent + implemented → warning (remove from element sets)
 */
export function resolveInterElementConformance(
    elements: ValidatedElements,
    schema: ClusterModel,
    nameDependentElements: NameDependentElements,
) {
    const { interdependents, conditionals } = nameDependentElements;

    if (!interdependents.size) {
        // Only conditionals — they're already resolved, just apply results
        applyConditionalResults(elements, nameDependentElements);
        return;
    }

    // Step 1: Group initialization — each interdependent element starts in its own group
    const elementToGroup = new Map<string, Group>();
    const groups: Group[] = [];

    for (const [name, entry] of interdependents) {
        const group: Group = { members: [entry], depGroups: new Set() };
        groups.push(group);
        elementToGroup.set(name, group);
    }

    // Step 2: Cycle detection via DFS — merge cycles into single groups
    const enum DfsState {
        Unvisited,
        InProgress,
        Done,
    }

    const dfsState = new Map<string, DfsState>();
    const dfsStack: string[] = [];

    function dfs(name: string) {
        dfsState.set(name, DfsState.InProgress);
        dfsStack.push(name);

        const info = interdependents.get(name);
        if (info) {
            for (const dep of info.dependencies) {
                if (!interdependents.has(dep)) {
                    // Already resolved — skip
                    continue;
                }

                const state = dfsState.get(dep);
                if (state === DfsState.InProgress) {
                    // Cycle detected — merge all elements on the stack from dep onwards
                    const cycleStart = dfsStack.indexOf(dep);
                    mergeGroups(dfsStack.slice(cycleStart), elementToGroup, groups);
                } else if (state === undefined) {
                    dfs(dep);
                }
            }
        }

        dfsStack.pop();
        dfsState.set(name, DfsState.Done);
    }

    for (const name of interdependents.keys()) {
        if (!dfsState.has(name)) {
            dfs(name);
        }
    }

    // Build inter-group dependency edges
    for (const [name, info] of interdependents) {
        const myGroup = elementToGroup.get(name)!;
        for (const dep of info.dependencies) {
            // Find the group for this dep — could be resolved or unresolved
            const depGroup = elementToGroup.get(dep);
            if (depGroup && depGroup !== myGroup) {
                myGroup.depGroups.add(depGroup);
            }
        }
    }

    // Step 3: Propagation — topological sort then bottom-up resolution
    const uniqueGroups = [...new Set(groups)];
    const sorted = topoSort(uniqueGroups);

    for (const group of sorted) {
        // Check if any dependency group is present
        let anyDepPresent = false;
        for (const depGroup of group.depGroups) {
            if (depGroup.presence) {
                anyDepPresent = true;
                break;
            }
        }

        if (anyDepPresent) {
            group.presence = true;
        } else {
            // Use fallback logic
            if (group.members.length === 1) {
                const member = group.members[0];

                // Check resolved deps: already-validated elements + conditionals
                let resolvedDepPresent = false;
                for (const dep of member.dependencies) {
                    if (!interdependents.has(dep)) {
                        // Check the element sets populated by #validateX
                        if (isResolvedElementPresent(elements, dep, schema) || conditionals.get(dep)?.presence) {
                            resolvedDepPresent = true;
                            break;
                        }
                    }
                }

                if (resolvedDepPresent) {
                    group.presence = true;
                } else {
                    switch (member.fallback) {
                        case Conformance.Applicability.Mandatory:
                            group.presence = true;
                            break;
                        case Conformance.Applicability.None:
                            group.presence = false;
                            break;
                        case Conformance.Applicability.Optional:
                            group.presence = member.isImplemented;
                            break;
                    }
                }
            } else {
                // Cyclic group — present only if all members are implemented
                group.presence = group.members.every(m => m.isImplemented);
            }
        }

        // Apply group presence to all member entries
        for (const member of group.members) {
            applyPresence(elements, member, group.presence!);
        }
    }

    // Apply conditional results (no-dep elements already resolved)
    applyConditionalResults(elements, nameDependentElements);
}

/**
 * Check if a dep name is present among already-resolved elements (from #validateX passes).
 */
function isResolvedElementPresent(elements: ValidatedElements, depName: string, schema: ClusterModel): boolean {
    // Look up the model by name to get its propertyName
    const conformant = schema.conformant;
    const model = conformant.attributes(depName) ?? conformant.commands(depName) ?? conformant.events(depName);

    if (!model) {
        return false;
    }

    const propName = model.propertyName;
    return elements.attributes.has(propName) || elements.commands.has(propName) || elements.events.has(propName);
}

interface Group {
    members: NameDependentElements.Interdependent[];
    depGroups: Set<Group>;
    presence?: boolean;
}

function applyConditionalResults(elements: ValidatedElements, nameDependentElements: NameDependentElements) {
    for (const [, conditional] of nameDependentElements.conditionals) {
        applyPresence(elements, conditional, conditional.presence);
    }
}

/**
 * Apply a resolved presence to an element — emit errors/warnings and update element sets.
 */
function applyPresence(elements: ValidatedElements, entry: NameDependentElements.Entry, presence: boolean) {
    const propName = entry.model.propertyName;

    if (presence && !entry.isImplemented) {
        const target =
            entry.elementType === "attribute"
                ? `State.${propName}`
                : entry.elementType === "command"
                  ? propName
                  : `cluster.events.${propName}`;

        if (entry.elementType === "command") {
            const isPresent = elements.presentCommands.has(propName);
            elements.error(target, isPresent ? "Throws unimplemented exception" : "Implementation missing", !isPresent);
        } else {
            elements.error(target, "Mandatory element unsupported", false);
        }
    } else if (!presence && entry.isImplemented) {
        const target =
            entry.elementType === "attribute"
                ? `State.${propName}`
                : entry.elementType === "command"
                  ? propName
                  : `cluster.events.${propName}`;
        elements.error(target, "Element should not be present", false);

        // Remove from element sets
        switch (entry.elementType) {
            case "attribute":
                elements.attributes.delete(propName);
                elements.attributeIds.delete(propName);
                break;
            case "command":
                elements.commands.delete(propName);
                break;
            case "event":
                elements.events.delete(propName);
                break;
        }
    }
}

function mergeGroups(names: string[], elementToGroup: Map<string, Group>, groups: Group[]) {
    if (names.length < 2) {
        return;
    }

    const target = elementToGroup.get(names[0])!;

    for (let i = 1; i < names.length; i++) {
        const other = elementToGroup.get(names[i])!;
        if (other === target) {
            continue;
        }

        // Merge other into target
        for (const member of other.members) {
            if (!target.members.includes(member)) {
                target.members.push(member);
            }
            elementToGroup.set(member.model.name, target);
        }

        for (const dep of other.depGroups) {
            if (dep !== target) {
                target.depGroups.add(dep);
            }
        }

        // Remove from groups array
        const idx = groups.indexOf(other);
        if (idx !== -1) {
            groups.splice(idx, 1);
        }
    }

    // Remove self-references
    target.depGroups.delete(target);
}

/**
 * Topological sort of groups (Kahn's algorithm).  Returns groups in bottom-up order (leaves first).
 */
function topoSort(groups: Group[]): Group[] {
    const inDegree = new Map<Group, number>();

    // Count how many groups depend on each group
    const dependents = new Map<Group, Group[]>();
    for (const g of groups) {
        for (const dep of g.depGroups) {
            let list = dependents.get(dep);
            if (!list) {
                list = [];
                dependents.set(dep, list);
            }
            list.push(g);
        }
        inDegree.set(g, g.depGroups.size);
    }

    // Start with leaves (no dependencies)
    const queue: Group[] = [];
    for (const g of groups) {
        if (inDegree.get(g) === 0) {
            queue.push(g);
        }
    }

    const result: Group[] = [];
    while (queue.length) {
        const g = queue.shift()!;
        result.push(g);

        const deps = dependents.get(g);
        if (deps) {
            for (const dependent of deps) {
                const newDegree = inDegree.get(dependent)! - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0) {
                    queue.push(dependent);
                }
            }
        }
    }

    return result;
}
