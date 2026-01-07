/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access } from "#aspects/Access.js";

const FLAG_PERMUTATIONS: [string, Access.Ast][] = [
    ["R", { rw: Access.Rw.Read }],
    ["W", { rw: Access.Rw.Write }],
    ["RW", { rw: Access.Rw.ReadWrite }],
    ["R[W]", { rw: Access.Rw.ReadWriteOption }],
    ["F", { fabric: Access.Fabric.Scoped }],
    ["S", { fabric: Access.Fabric.Sensitive }],
    ["V", { readPriv: Access.Privilege.View }],
    ["VO", { readPriv: Access.Privilege.View, writePriv: Access.Privilege.Operate }],
    ["VM", { readPriv: Access.Privilege.View, writePriv: Access.Privilege.Manage }],
    ["VA", { readPriv: Access.Privilege.View, writePriv: Access.Privilege.Administer }],
    ["O", { readPriv: Access.Privilege.Operate, writePriv: Access.Privilege.Operate }],
    ["OM", { readPriv: Access.Privilege.Operate, writePriv: Access.Privilege.Manage }],
    ["OA", { readPriv: Access.Privilege.Operate, writePriv: Access.Privilege.Administer }],
    ["M", { readPriv: Access.Privilege.Manage, writePriv: Access.Privilege.Manage }],
    ["MA", { readPriv: Access.Privilege.Manage, writePriv: Access.Privilege.Administer }],
    ["A", { readPriv: Access.Privilege.Administer, writePriv: Access.Privilege.Administer }],
    ["T", { timed: true }],
    [
        "RW F VO T",
        {
            rw: Access.Rw.ReadWrite,
            fabric: Access.Fabric.Scoped,
            readPriv: Access.Privilege.View,
            writePriv: Access.Privilege.Operate,
            timed: true,
        },
    ],
];

describe("Access", () => {
    FLAG_PERMUTATIONS.forEach(([text, ast]) => {
        describe(text, () => {
            it("parses", () => {
                expect({ ...new Access(text) }).deep.equal({ ...new Access(ast), definition: text });
            });

            it("serializes", () => {
                expect(new Access(ast).toString()).equal(text);
            });
        });
    });

    describe("illegal flag", () => {
        it("records error", () => {
            expect(new Access("Z").errors).deep.equal([
                {
                    code: "UNKNOWN_ACCESS_FLAG",
                    message: 'Unknown flag "Z"',
                    source: 'Access "Z"',
                },
            ]);
        });
    });

    describe("readable", () => {
        it("set by R", () => {
            expect(new Access("R").readable).equals(true);
            expect(new Access("R F A").readable).equals(true);
        });

        it("requires R", () => {
            expect(new Access("W").readable).equals(false);
            expect(new Access("W F A").readable).equals(false);
        });
    });

    describe("writable", () => {
        it("set by W", () => {
            expect(new Access("W").writable).equals(true);
            expect(new Access("W F A").writable).equals(true);
        });

        it("requires W", () => {
            expect(new Access("R").writable).equals(false);
            expect(new Access("R F A").writable).equals(false);
        });
    });

    describe("complete", () => {
        it("requires r/w privileges if RW", () => {
            expect(new Access("RW").complete).equals(false);
            expect(new Access("RW V").complete).equals(false);
            expect(new Access("RW V O").complete).equals(true);
        });

        it("requires read privilege if R", () => {
            expect(new Access("R").complete).equals(false);
            expect(new Access("R V").complete).equals(true);
            expect(new Access("R O").complete).equals(true);
            expect(new Access("R V O").complete).equals(true);
        });

        it("requires write privilege if W", () => {
            expect(new Access("W").complete).equals(false);
            expect(new Access("W V").complete).equals(false);
            expect(new Access("R O").complete).equals(true);
            expect(new Access("R V O").complete).equals(true);
        });
    });
});
