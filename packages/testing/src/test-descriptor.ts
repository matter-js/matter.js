/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FilesystemSync } from "#tools";
import { readFile, writeFile } from "node:fs/promises";
import { PicsExpression } from "./chip/pics/expression.js";
import type { PicsFile } from "./chip/pics/file.js";

/**
 * Metadata for a single test or group of tests.
 */
export interface TestDescriptor {
    name: string;
    kind: TestDescriptor.Kind;
    path?: string;
    subpath?: string;
    app?: string;
    members?: TestDescriptor[];
    isDisabled?: boolean;
    timeoutMs?: number;
    description?: string;
    pics?: string;
    config?: Record<string, unknown>;
    startUncommissioned?: boolean;
    runAt?: Date;
    passed?: boolean;
    durationMs?: number;
    picsValues?: PicsFile;
}

export interface TestFileDescriptor extends TestDescriptor {
    path: string;
}

export interface TestSuiteDescriptor extends TestDescriptor {
    members: TestDescriptor[];
}

export interface RootTestDescriptor extends TestDescriptor {
    format?: number;
}

export namespace TestDescriptor {
    /**
     * Used to validate format of test descriptor files.
     */
    export const CURRENT_FORMAT = 2;

    export type Kind = "suite" | "js" | "py" | "yaml" | "manual" | "step";

    export const DEFAULT_FILENAME = "build/test-report.json";

    export interface Filesystem extends FilesystemSync<Stat> {
        descriptor: TestDescriptor;
    }

    export interface Stat extends FilesystemSync.Stat {
        descriptor: TestDescriptor;
    }

    export type Criteria = {
        includePaths?: string[];
        kinds?: Kind[];
        pics?: PicsFile;
        predicate?: (descriptor: TestDescriptor) => boolean;
    };

    /**
     * Create a filter function for specified criteria.
     *
     * The filter treats tests as atomic and ignores empty suites.
     */
    export function filter(descriptor: TestDescriptor, criteria: Criteria): TestDescriptor | undefined {
        const { includePaths, kinds, pics, predicate } = criteria;

        // Index the inclusion paths so we can efficiently short-circuit search
        interface NameNode extends Record<string, NameNode | undefined> {}
        let memberNames: undefined | NameNode;
        if (includePaths) {
            memberNames = {};
            for (const path of includePaths) {
                let incl = memberNames;
                const segments = path.split("/");
                if (segments[0] === "") {
                    segments[0] = descriptor.name;
                }
                for (const segment of segments) {
                    incl = (incl[segment] as NameNode) ??= {};
                }
            }
        }

        return filter(descriptor, memberNames);

        function filter(descriptor: TestDescriptor, names?: NameNode): TestDescriptor | undefined {
            // Short circuit irrelevant paths
            const memberNames = names?.[descriptor.name];
            if (names && !memberNames) {
                return;
            }

            // Apply PICS to any descriptor with a PICS expression
            if (pics && descriptor.pics !== undefined) {
                descriptor.picsValues = pics;
                const expr = new PicsExpression(descriptor.pics);
                if (!expr.evaluate(pics)) {
                    return;
                }
            }

            // Recurse into suites
            if (descriptor.kind === "suite") {
                const { members } = descriptor;
                if (!members?.length) {
                    return;
                }

                let filteredMembers: undefined | TestDescriptor[];
                for (const member of members) {
                    const filteredMember = filter(member, memberNames);
                    if (!filteredMember) {
                        continue;
                    }
                    if (predicate && !predicate(filteredMember)) {
                        continue;
                    }
                    if (filteredMembers) {
                        filteredMembers.push(filteredMember);
                    } else {
                        filteredMembers = [filteredMember];
                    }
                }

                // Return filtered member if any children apply
                if (filteredMembers) {
                    return { ...descriptor, members: filteredMembers };
                }

                // All members excluded
                return;
            }

            // Filter tests based on kind
            if (kinds && !kinds.includes(descriptor.kind)) {
                return;
            }

            return descriptor;
        }
    }

    /**
     * Visit a {@link TestDescriptor} hierarchy.
     */
    export function visit(descriptor: TestDescriptor, fn: (descriptor: TestDescriptor) => void | boolean): void {
        if (fn(descriptor) === false) {
            return;
        }

        if (!descriptor.members) {
            return;
        }

        for (const member of descriptor.members) {
            visit(member, fn);
        }
    }

    /**
     * Load an existing persisted descriptor or create a new one.
     */
    export async function open(path: string): Promise<TestSuiteDescriptor> {
        let descriptor: TestSuiteDescriptor = {
            name: "?",
            kind: "suite",
            members: [],
        };

        try {
            const json = await readFile(path, "utf-8");
            descriptor = JSON.parse(json, (k, v) => (k === "picsValues" ? undefined : v));
            if (
                typeof descriptor?.name !== "string" ||
                descriptor.kind !== "suite" ||
                !Array.isArray(descriptor.members)
            ) {
                throw new Error(`Invalid test descriptor "${path}"`);
            }
        } catch (e) {
            if (!(e instanceof SyntaxError) && (e as undefined | { code?: string })?.code !== "ENOENT") {
                throw e;
            }
        }

        return descriptor;
    }

    /**
     * Persist a descriptor.
     */
    export async function save(path: string, descriptor: TestSuiteDescriptor) {
        await writeFile(
            path,
            JSON.stringify(descriptor, (k, v) => (k === "picsValues" ? undefined : v), 4),
        );
    }

    /**
     * Create a new test descriptor that combines information from a previous run with a new run.
     *
     * We do not just overwrite the descriptor because a {@link TestSuiteDescriptor} will not include information about
     * tests that were excluded from a run.
     */
    export function merge<T extends TestDescriptor>(previous: TestDescriptor, updates: T): T {
        const descriptor = {
            ...updates,
        };

        for (const name of ["durationMs", "passed", "runAt"] as const) {
            if (previous[name] !== undefined && descriptor[name] === undefined) {
                (descriptor as Record<string, unknown>)[name] = previous[name];
            }
        }

        if (previous.members === undefined) {
            return descriptor;
        }

        if (updates.members === undefined) {
            descriptor.members = previous.members;
            return descriptor;
        }

        const updatedMembers = {} as Record<string, TestDescriptor>;
        for (const member of updates.members) {
            updatedMembers[member.name] = member;
        }

        const newMembers = Array<TestDescriptor>();
        for (const member of previous.members) {
            const update = updatedMembers[member.name];

            if (update === undefined) {
                newMembers.push({
                    ...member,
                    isDisabled: true,
                });
                continue;
            }

            newMembers.push(merge(member, update));
            delete updatedMembers[member.name];
        }

        newMembers.push(...Object.values(updatedMembers));

        descriptor.members = newMembers;

        return descriptor;
    }

    /**
     * A {@link FilesystemSync} adapter for {@link TestDescriptor}.
     */
    export function Filesystem(root: TestDescriptor): TestDescriptor.Filesystem {
        const index = new WeakMap<TestDescriptor, Record<string, TestDescriptor>>();

        return {
            descriptor: root,

            resolve(...segments) {
                let result = "/";

                for (const segment of segments) {
                    if (segment.startsWith("/")) {
                        result = segment;
                        continue;
                    }

                    if (result[result.length - 1] !== "/") {
                        result = `${result}/${segment}`;
                        continue;
                    }

                    result = `${result}${segment}`;
                }

                return result;
            },

            readdir(path) {
                return this.stat(path)?.descriptor.members?.map(m => m.name);
            },

            stat(path) {
                const segments = path.split("/");

                const breadcrumb = [root];
                for (const segment of segments) {
                    if (segment === "." || segment === "") {
                        continue;
                    }

                    if (segment === "..") {
                        if (breadcrumb.length > 1) {
                            breadcrumb.pop();
                        }
                        continue;
                    }

                    const descriptor = memberOf(breadcrumb[breadcrumb.length - 1], segment);
                    if (!descriptor) {
                        return;
                    }

                    breadcrumb.push(descriptor);
                }

                const descriptor = breadcrumb[breadcrumb.length - 1];

                const isSuite = descriptor.kind === "suite";
                return {
                    isDirectory: isSuite,
                    isFile: !isSuite && descriptor.path !== undefined,
                    descriptor,
                };
            },
        };

        function memberOf(descriptor: TestDescriptor, name: string): TestDescriptor | undefined {
            const { members } = descriptor;
            if (!members?.length) {
                return;
            }

            let slot = index.get(descriptor);
            if (!slot) {
                slot = {} as Record<string, TestDescriptor>;
                for (const member of members) {
                    const existing = slot[member.name];
                    if (existing !== undefined) {
                        switch (existing.kind) {
                            case "suite":
                                continue;

                            case "js":
                                if (member.kind === "suite") {
                                    continue;
                                }
                                break;

                            case "py":
                                if (member.kind === "suite" || member.kind !== "js") {
                                    continue;
                                }
                                break;

                            case "yaml":
                                if (member.kind === "suite" || member.kind === "js" || member.kind === "py") {
                                    continue;
                                }
                                break;

                            case member.kind:
                                continue;
                        }
                    }

                    slot[member.name] = member;
                }
                index.set(descriptor, slot);
            }

            return slot[name];
        }
    }
}
