/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel, FieldModel, Matter } from "#index.js";

describe("AttributeModel", () => {
    function attribute(type: string, access: string) {
        return new AttributeModel(
            { id: 0, name: "Entries", type, access },
            ...(type === "list" ? [new FieldModel({ name: "entry", type: "uint8" })] : []),
        );
    }

    describe("fabricScopedList", () => {
        it("is true for a list with fabric-scoped access", () => {
            expect(attribute("list", "RW F").fabricScopedList).true;
        });

        it("is true for a list with fabric-sensitive access", () => {
            expect(attribute("list", "RW S").fabricScopedList).true;
        });

        it("is false for a value that is not a list, whatever its access", () => {
            expect(attribute("uint8", "RW F").fabricScopedList).false;
            expect(attribute("uint8", "RW S").fabricScopedList).false;
        });

        it("is false for a list without fabric access", () => {
            expect(attribute("list", "RW").fabricScopedList).false;
        });

        it("holds for the ACL of the standard model", () => {
            const acl = Matter.clusters.require("AccessControl").attributes.require("Acl");
            expect(acl.fabricScopedList).true;
        });
    });

    describe("fabricScoped", () => {
        // Characterization: the access alone decides
        it("is true for a value with fabric-scoped access that is not a list", () => {
            expect(attribute("uint8", "RW F").fabricScoped).true;
        });
    });
});
