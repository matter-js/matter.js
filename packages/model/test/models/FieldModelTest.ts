/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatatypeModel, FieldModel } from "#models/index.js";

describe("FieldModel", () => {
    describe("enum range member", () => {
        function enumWith(...children: FieldModel[]) {
            new DatatypeModel({ name: "TestEnum", type: "enum8" }, ...children);
            return children;
        }

        it("has no ID and is keyed by its range", () => {
            const [, range] = enumWith(
                new FieldModel({ name: "Zero", id: 0 }),
                new FieldModel({ name: "MfgValues", constraint: "128 to 191" }),
            );

            expect(range.isEnumRange).true;
            expect(range.effectiveId).undefined;
            expect(range.key).equals("128 to 191");
        });

        it("leaves an enum member without ID or range at its position", () => {
            const [, positional] = enumWith(new FieldModel({ name: "Zero" }), new FieldModel({ name: "One" }));

            expect(positional.isEnumRange).false;
            expect(positional.effectiveId).equals(1);
        });

        it("does not apply to a constrained struct field", () => {
            const field = new FieldModel({ name: "Level", constraint: "0 to 100" });
            new DatatypeModel({ name: "TestStruct", type: "struct" }, field);

            expect(field.isEnumRange).false;
            expect(field.effectiveId).equals(0);
        });
    });
});
