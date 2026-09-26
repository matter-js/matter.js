/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { parsePipeTable } from "#mom/spec/md/parse-tables.js";

describe("pipe table parsing", () => {
    it("reads an escaped pipe as a literal pipe in its cell", () => {
        const table = parsePipeTable([
            "| Bit | Name | Summary | Conformance |",
            "| --- | --- | --- | --- |",
            "| 0 | ExecuteIfOff | Dependency on On/Off cluster | LT \\| OO |",
        ]);

        expect(table.rows).deep.equal([
            { bit: "0", name: "ExecuteIfOff", summary: "Dependency on On/Off cluster", conformance: "LT | OO" },
        ]);
    });

    it("reads several escaped pipes inside one cell", () => {
        const table = parsePipeTable([
            "| Bit | Code | Conformance |",
            "| --- | --- | --- |",
            "| 2 | OFFONLY | [!(LT \\| DF \\| OO)] |",
        ]);

        expect(table.rows).deep.equal([{ bit: "2", code: "OFFONLY", conformance: "[!(LT | DF | OO)]" }]);
    });

    it("still joins an unescaped pipe in the conformance column back into that cell", () => {
        const table = parsePipeTable([
            "| Name | Conformance | Summary |",
            "| --- | --- | --- |",
            "| A | VIS | AUD | text |",
        ]);

        expect(table.rows).deep.equal([{ name: "A", conformance: "VIS | AUD", summary: "text" }]);
    });
});
