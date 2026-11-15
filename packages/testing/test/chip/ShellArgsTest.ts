/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { splitShellArgs, UnterminatedQuoteError } from "../../src/chip/shell-args.js";

describe("splitShellArgs", () => {
    it("splits at whitespace", () => {
        expect(splitShellArgs("  --discriminator 1234\t--KVS  kvs1 ")).deep.equals([
            "--discriminator",
            "1234",
            "--KVS",
            "kvs1",
        ]);
    });

    it("removes double quotes around a value", () => {
        expect(splitShellArgs('--device "*" --groupcast')).deep.equals(["--device", "*", "--groupcast"]);
    });

    it("keeps whitespace and backslashes inside single quotes", () => {
        expect(splitShellArgs("--name 'a b\\c'")).deep.equals(["--name", "a b\\c"]);
    });

    it("unescapes a double quote and a backslash inside double quotes", () => {
        expect(splitShellArgs('--json "{\\"a\\": 1}" "x\\\\y"')).deep.equals(["--json", '{"a": 1}', "x\\y"]);
    });

    it("joins adjacent quoted and unquoted parts into one argument", () => {
        expect(splitShellArgs('--string-arg=path:"/a b"/c')).deep.equals(["--string-arg=path:/a b/c"]);
    });

    it("keeps an empty quoted argument", () => {
        expect(splitShellArgs('--x "" y')).deep.equals(["--x", "", "y"]);
    });

    it("escapes a space outside quotes", () => {
        expect(splitShellArgs("a\\ b c")).deep.equals(["a b", "c"]);
    });

    it("refuses an unterminated quote", () => {
        expect(() => splitShellArgs('--device "*')).throws(UnterminatedQuoteError);
        expect(() => splitShellArgs("--device '*")).throws(UnterminatedQuoteError);
    });
});
