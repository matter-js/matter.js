/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestDescriptor } from "../src/test-descriptor.js";

const tests: TestDescriptor = {
    name: "chip",
    kind: "suite",
    members: [
        {
            name: "IDM",
            kind: "suite",
            members: [
                { name: "1.1", kind: "py", path: "TC_IDM_1_1.py" },
                {
                    name: "1.2",
                    kind: "suite",
                    members: [
                        { name: "run1", kind: "py", path: "TC_IDM_1_2.py" },
                        { name: "run2", kind: "py", path: "TC_IDM_1_2.py" },
                    ],
                },
            ],
        },
        { name: "DESC", kind: "suite", members: [{ name: "2.1", kind: "py", path: "TC_DESC_2_1.py" }] },
    ],
};

/** The selected tests by path, keyed by descriptor, which `chip(...).exclude()` uses to find a registered test. */
function leavesOf(filtered: TestDescriptor | undefined) {
    const leaves = new Map<TestDescriptor, string>();
    if (filtered) {
        (function collect(descriptor: TestDescriptor, path: string) {
            if (descriptor.members === undefined) {
                leaves.set(descriptor, path);
                return;
            }
            for (const member of descriptor.members) {
                collect(member, `${path}/${member.name}`);
            }
        })(filtered, "");
    }
    return leaves;
}

function selected(...includePaths: string[]) {
    return [...leavesOf(TestDescriptor.filter(tests, { includePaths })).values()];
}

/**
 * The glob and filter calls of `chip(include).exclude(...exclude)` in chip.ts, which the builder makes against the
 * global `chip.tests`; keep the two in step.
 */
function registered(include: string, ...exclude: string[]) {
    const fs = TestDescriptor.Filesystem(tests);
    const included = leavesOf(
        TestDescriptor.filter(tests, { includePaths: TestDescriptor.glob(include, fs), kinds: ["py", "yaml", "cert"] }),
    );
    for (const descriptor of leavesOf(
        TestDescriptor.filter(tests, { includePaths: TestDescriptor.glob(exclude, fs) }),
    ).keys()) {
        included.delete(descriptor);
    }
    return [...included.values()];
}

describe("TestDescriptor.filter", () => {
    it("selects every run of a test its path names", () => {
        expect(selected("/IDM/1.2")).deep.equals(["/IDM/1.2/run1", "/IDM/1.2/run2"]);
    });

    it("selects every test and run below a suite its path names", () => {
        expect(selected("/IDM")).deep.equals(["/IDM/1.1", "/IDM/1.2/run1", "/IDM/1.2/run2"]);
    });

    it("selects only the run a path names", () => {
        expect(selected("/IDM/1.2/run2")).deep.equals(["/IDM/1.2/run2"]);
    });

    it("selects all runs when one path names the test and another one of its runs", () => {
        expect(selected("/IDM/1.2", "/IDM/1.2/run1")).deep.equals(["/IDM/1.2/run1", "/IDM/1.2/run2"]);
        expect(selected("/IDM/1.2/run1", "/IDM/1.2")).deep.equals(["/IDM/1.2/run1", "/IDM/1.2/run2"]);
    });

    it("reads a path with a trailing slash as the path without it", () => {
        expect(selected("/IDM/")).deep.equals(["/IDM/1.1", "/IDM/1.2/run1", "/IDM/1.2/run2"]);
        expect(selected("/")).deep.equals(["/IDM/1.1", "/IDM/1.2/run1", "/IDM/1.2/run2", "/DESC/2.1"]);
    });

    it("selects nothing outside the paths", () => {
        expect(selected("/IDM/1.1", "/DESC/2.1")).deep.equals(["/IDM/1.1", "/DESC/2.1"]);
        expect(selected("/IDM/9.9")).deep.equals([]);
    });
});

describe("TestDescriptor.glob", () => {
    const fs = TestDescriptor.Filesystem(tests);

    it("resolves a name that matches no test to no path", () => {
        expect(TestDescriptor.glob("IDM/9.9", fs)).deep.equals([]);
        expect(TestDescriptor.glob("IDM/*/run9", fs)).deep.equals([]);
    });

    it("resolves each pattern of a list", () => {
        expect(TestDescriptor.glob(["IDM/1.1", "DESC/*"], fs)).deep.equals(["/IDM/1.1", "/DESC/2.1"]);
    });
});

describe("glob and filter selection", () => {
    it("registers every run of a multi-run test through a suite glob", () => {
        expect(registered("IDM/*")).deep.equals(["/IDM/1.1", "/IDM/1.2/run1", "/IDM/1.2/run2"]);
    });

    it("excludes every run of a multi-run test and keeps the other tests", () => {
        expect(registered("IDM/*", "IDM/1.2/*")).deep.equals(["/IDM/1.1"]);
    });

    it("excludes only the run an exclude names", () => {
        expect(registered("IDM/*", "IDM/1.2/run2")).deep.equals(["/IDM/1.1", "/IDM/1.2/run1"]);
    });

    it("registers every run of a multi-run test through its name", () => {
        expect(registered("IDM/1.2")).deep.equals(["/IDM/1.2/run1", "/IDM/1.2/run2"]);
    });

    it("excludes every run of a multi-run test through its name", () => {
        expect(registered("IDM/*", "IDM/1.2")).deep.equals(["/IDM/1.1"]);
    });

    it("registers a single-run test through its name", () => {
        expect(registered("IDM/1.1")).deep.equals(["/IDM/1.1"]);
    });
});
