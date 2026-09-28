/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "@matter/main";
import { disableEndpointValidation } from "../src/NodeTestInstance.js";

describe("disableEndpointValidation", () => {
    it("turns validation off for its own environment only", () => {
        const parent = new Environment("parent");
        parent.vars.set("test.inherited", "kept");
        const first = new Environment("first", parent);

        disableEndpointValidation(first);

        expect(first.vars.string("endpoint.validation")).equals("off");
        expect(first.vars.string("test.inherited")).equals("kept");
        expect(parent.vars.string("endpoint.validation")).undefined;

        const second = new Environment("second", parent);
        expect(second.vars.string("endpoint.validation")).undefined;
    });

    it("leaves an instance created afterwards from the default environment unaffected", () => {
        const before = Environment.default.vars.string("endpoint.validation");

        disableEndpointValidation(new Environment("first", Environment.default));

        expect(Environment.default.vars.string("endpoint.validation")).equals(before);
        expect(new Environment("second", Environment.default).vars.string("endpoint.validation")).equals(before);
    });
});
