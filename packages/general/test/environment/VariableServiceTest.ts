/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { VariableService } from "#environment/VariableService.js";

describe("VariableService", () => {
    function testVars(setup: (vars: VariableService) => void) {
        const vars = new VariableService(new Environment("test"));
        setup(vars);
        expect(vars.get("variable.one", false)).equals(true);
        expect(vars.get("variable.two", 2)).equals(4);
        expect(vars.get("user")).deep.equals({ name: "Bob", age: "78" });
        expect(vars.get("list")).deep.equals({ "0": "entry1" });
        expect(vars.get("objectlist")).deep.equals({ "0": { entry: "1" } });
        expect(vars.get("indexedobject")).deep.equals({ entry: { subentry: "Value" } });
    }

    it("adds by name", () => {
        testVars(vars => {
            vars.set("variable.one", true);
            vars.set("variable.two", 4);
            vars.set("user", { name: "Bob", age: "78" });
            vars.set("list", { "0": "entry1" });
            vars.set("objectlist", { "0": { entry: "1" } });
            vars.set("indexedobject", { entry: { subentry: "Value" } });
        });
    });

    it("adds UNIX env style", () => {
        testVars(vars =>
            vars.addUnixEnvStyle({
                PATH: "/usr/bin",
                MATTER_VARIABLE_ONE: "true",
                MATTER_VARIABLE_TWO: "4",
                MATTER_USER_NAME: "Bob",
                MATTER_USER_AGE: "78",
                MATTER_LIST_0: "entry1",
                MATTER_OBJECTLIST_0_ENTRY: "1",
                MATTER_INDEXEDOBJECT_ENTRY_SUBENTRY: "Value",
            }),
        );
    });

    it("adds argv style", () => {
        testVars(vars =>
            vars.addArgvStyle([
                "--variable-one",
                "--variable-two=4",
                "--user-name=Bob",
                "--user-age=78",
                "--list-0=entry1",
                "--objectlist-0-entry=1",
                "--indexedobject-entry-subentry=Value",
            ]),
        );
    });

    it("adds config style", () => {
        testVars(vars =>
            vars.addConfigStyle({
                variable: {
                    one: true,
                    two: 4,
                },
                user: {
                    name: "Bob",
                    age: "78",
                },
                list: { "0": "entry1" },
                objectlist: { "0": { entry: "1" } },
                indexedobject: { entry: { subentry: "Value" } },
            }),
        );
    });

    it("updates usages automatically", () => {
        const vars = new VariableService(new Environment("test"));

        vars.set("some.text", "foo");
        vars.set("some.number", 4);

        const history = Array<{ text: string; number: number }>();

        const usage = vars.use(() => {
            history.push({ text: vars.get("some.text"), number: vars.get("some.number") });
        });

        vars.set("some.text", "bar");
        vars.set("some.number", 8);

        usage.close();
        vars.set("some.number", 16);

        expect(history).deep.equals([
            { text: "foo", number: 4 },
            { text: "bar", number: 4 },
            { text: "bar", number: 8 },
        ]);
    });
});
