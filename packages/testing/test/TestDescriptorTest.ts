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
                { name: "1.1", kind: "py" },
                {
                    name: "1.2",
                    kind: "suite",
                    members: [
                        { name: "run1", kind: "py" },
                        { name: "run2", kind: "py" },
                    ],
                },
            ],
        },
        { name: "DESC", kind: "suite", members: [{ name: "2.1", kind: "py" }] },
    ],
};

function selected(...includePaths: string[]) {
    const names = new Array<string>();
    const filtered = TestDescriptor.filter(tests, { includePaths });
    if (filtered) {
        (function collect(descriptor: TestDescriptor, path: string) {
            if (descriptor.members === undefined) {
                names.push(path);
                return;
            }
            for (const member of descriptor.members) {
                collect(member, `${path}/${member.name}`);
            }
        })(filtered, "");
    }
    return names;
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
