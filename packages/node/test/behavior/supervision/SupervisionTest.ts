/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { ValidationLocation } from "#behavior/state/validation/location.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { Supervision } from "#behavior/supervision/Supervision.js";
import { GlobalConfig, LocalConfig, maybeConfigOf } from "#behavior/supervision/SupervisionConfig.js";
import { ClusterModel, DataModelPath, FieldModel } from "@matter/model";
import { ConstraintError } from "@matter/protocol";

describe("Supervision", () => {
    describe("GlobalConfig", () => {
        it("child() returns stable instances", () => {
            const config = new GlobalConfig();
            const child1 = config.child("foo");
            const child2 = config.child("foo");
            expect(child1).equals(child2);
        });

        it("child() creates distinct children for different keys", () => {
            const config = new GlobalConfig();
            const child1 = config.child("foo");
            const child2 = config.child("bar");
            expect(child1).not.equals(child2);
        });

        it("readonlyChild() returns undefined when no child exists", () => {
            const config = new GlobalConfig();
            expect(config.readonlyChild("foo")).undefined;
        });

        it("readonlyChild() returns existing child", () => {
            const config = new GlobalConfig();
            const child = config.child("foo");
            expect(config.readonlyChild("foo")).equals(child);
        });

        it("supports numeric keys for list indices", () => {
            const config = new GlobalConfig();
            const child = config.child(0);
            expect(config.readonlyChild(0)).equals(child);
            expect(config.readonlyChild(1)).undefined;
        });

        it("stores and retrieves config", () => {
            const config = new GlobalConfig();
            expect(config.config).undefined;
            config.config = { constraint: false };
            expect(config.config).deep.equals({ constraint: false });
        });
    });

    describe("LocalConfig", () => {
        it("inherits global config when no local override", () => {
            const global = new GlobalConfig();
            global.config = { validate: false };
            const local = new LocalConfig(global);
            expect(local.config).deep.equals({ validate: false });
        });

        it("local overrides shadow global", () => {
            const global = new GlobalConfig();
            global.config = { validate: false, conformance: true };
            const local = new LocalConfig(global);
            local.config = { constraint: false };
            expect(local.config).deep.equals({ constraint: false });
        });

        it("child() returns stable instances", () => {
            const global = new GlobalConfig();
            const local = new LocalConfig(global);
            const child1 = local.child("foo");
            const child2 = local.child("foo");
            expect(child1).equals(child2);
        });

        it("readonlyChild() returns undefined when global child doesn't exist", () => {
            const global = new GlobalConfig();
            const local = new LocalConfig(global);
            expect(local.readonlyChild("foo")).undefined;
        });

        it("readonlyChild() wraps existing global child", () => {
            const global = new GlobalConfig();
            global.child("foo").config = { constraint: false };
            const local = new LocalConfig(global);
            const child = local.readonlyChild("foo");
            expect(child).not.undefined;
            expect(child!.config).deep.equals({ constraint: false });
        });

        it("local child does not affect global", () => {
            const global = new GlobalConfig();
            const local = new LocalConfig(global);
            const child = local.child("foo");
            child.config = { constraint: false };
            // Global should not have this child's config
            expect(global.readonlyChild("foo")?.config).undefined;
        });
    });

    describe("Supervision()", () => {
        it("returns config for bare objects via WeakMap", () => {
            const obj: Record<string, unknown> = { a: 1, b: 2 };
            const config = Supervision(obj);
            expect(config).not.undefined;
            expect(config).equals(Supervision(obj));
        });

        it("returns field supervision for bare objects", () => {
            const obj: Record<string, unknown> = { a: 1, b: 2 };
            const sup = Supervision(obj, "a") as Supervision;
            expect(sup).not.undefined;
            sup.constraint = false;
            expect(sup.constraint).equals(false);
        });
    });

    describe("maybeConfigOf()", () => {
        it("returns undefined for unconfigured bare objects", () => {
            const obj: Record<string, unknown> = { x: 1 };
            expect(maybeConfigOf(obj)).undefined;
        });

        it("returns config after Supervision() was called", () => {
            const obj: Record<string, unknown> = { x: 1 };
            const config = Supervision(obj);
            expect(maybeConfigOf(obj)).equals(config);
        });

        it("returns undefined for unconfigured field", () => {
            const obj: Record<string, unknown> = { x: 1 };
            Supervision(obj); // ensure root config exists
            expect(maybeConfigOf(obj, "x")).undefined;
        });

        it("returns field config after Supervision() was called", () => {
            const obj: Record<string, unknown> = { x: 1 };
            const sup = Supervision(obj, "x") as Supervision;
            sup.constraint = false;
            expect(maybeConfigOf(obj, "x")).deep.equals({ constraint: false });
        });
    });

    describe("validation integration", () => {
        function createValidator(fields: FieldModel[]) {
            const cluster = new ClusterModel({
                name: "TestCluster",
                children: fields.map(f => f.clone()),
            });
            return RootSupervisor.for(cluster);
        }

        function validateWith(
            supervisor: RootSupervisor,
            record: Record<string, unknown>,
            config?: Supervision.Config,
        ) {
            const location: ValidationLocation = {
                path: new DataModelPath(supervisor.schema.path),
                config,
            };
            supervisor.validate?.(record, LocalActorContext.ReadOnly, location);
        }

        it("skips constraint validation when constraint is disabled", () => {
            const supervisor = createValidator([
                new FieldModel({ name: "value", type: "uint8", constraint: "0 to 100" }),
            ]);

            // Without config, 200 should fail
            expect(() => validateWith(supervisor, { value: 200 })).throws(ConstraintError);

            // With constraint disabled, 200 should pass
            const config = new GlobalConfig();
            config.child("value").config = { constraint: false };
            expect(() => validateWith(supervisor, { value: 200 }, config)).not.throws();
        });

        it("skips conformance validation when conformance is disabled", () => {
            const supervisor = createValidator([new FieldModel({ name: "required", type: "uint8", conformance: "M" })]);

            // Without config, missing mandatory field should fail
            expect(() => validateWith(supervisor, {})).throws();

            // With conformance disabled, missing mandatory field should pass
            const config = new GlobalConfig();
            config.child("required").config = { conformance: false };
            expect(() => validateWith(supervisor, {}, config)).not.throws();
        });

        it("disables both with validate = false", () => {
            const supervisor = createValidator([
                new FieldModel({ name: "value", type: "uint8", constraint: "0 to 100", conformance: "M" }),
            ]);

            // Without config, both should fail
            expect(() => validateWith(supervisor, {})).throws();
            expect(() => validateWith(supervisor, { value: 200 })).throws();

            // With validate = false, both should pass
            const config = new GlobalConfig();
            config.child("value").config = { validate: false };
            expect(() => validateWith(supervisor, {}, config)).not.throws();
            expect(() => validateWith(supervisor, { value: 200 }, config)).not.throws();
        });

        it("validates unconfigured fields normally", () => {
            const supervisor = createValidator([
                new FieldModel({ name: "configured", type: "uint8", constraint: "0 to 100" }),
                new FieldModel({ name: "normal", type: "uint8", constraint: "0 to 50" }),
            ]);

            const config = new GlobalConfig();
            config.child("configured").config = { constraint: false };

            // configured field passes with out-of-range value
            // normal field still enforces constraint
            expect(() => validateWith(supervisor, { configured: 200, normal: 25 }, config)).not.throws();
            expect(() => validateWith(supervisor, { configured: 200, normal: 100 }, config)).throws(ConstraintError);
        });

        it("list entry config applies to all entries", () => {
            const supervisor = createValidator([
                new FieldModel({
                    name: "items",
                    type: "list",
                    children: [new FieldModel({ name: "entry", type: "uint8", constraint: "0 to 100" })],
                }),
            ]);

            // Without config, out-of-range entries fail
            expect(() => validateWith(supervisor, { items: [50, 200] })).throws(ConstraintError);

            // With entry config disabling constraint, they pass
            const config = new GlobalConfig();
            config.child("items").child("entry").config = { constraint: false };
            expect(() => validateWith(supervisor, { items: [50, 200] }, config)).not.throws();
        });

        it("per-index config overrides entry config", () => {
            const supervisor = createValidator([
                new FieldModel({
                    name: "items",
                    type: "list",
                    children: [new FieldModel({ name: "entry", type: "uint8", constraint: "0 to 100" })],
                }),
            ]);

            // Disable constraint for entry, but re-enable for index 1
            const config = new GlobalConfig();
            const itemsConfig = config.child("items");
            itemsConfig.child("entry").config = { constraint: false };
            itemsConfig.child(1).config = { constraint: true };

            // Index 0 has constraint disabled (falls back to "entry"), index 1 has it enabled
            expect(() => validateWith(supervisor, { items: [200, 50] }, config)).not.throws();
            expect(() => validateWith(supervisor, { items: [200, 200] }, config)).throws(ConstraintError);
        });

        it("validate = false disables entire subtree", () => {
            const supervisor = createValidator([
                new FieldModel({
                    name: "nested",
                    type: "struct",
                    children: [
                        new FieldModel({ name: "required", type: "uint8", conformance: "M" }),
                        new FieldModel({ name: "constrained", type: "uint8", constraint: "0 to 100" }),
                    ],
                }),
            ]);

            // Without config, child violations are caught
            expect(() => validateWith(supervisor, { nested: { constrained: 200 } })).throws();

            // With validate=false on the struct, child fields are never visited
            const config = new GlobalConfig();
            config.child("nested").config = { validate: false };
            expect(() => validateWith(supervisor, { nested: { constrained: 200 } }, config)).not.throws();
            expect(() => validateWith(supervisor, { nested: {} }, config)).not.throws();
        });

        it("discovers Supervision config from bare object when location.config is unset", () => {
            const supervisor = createValidator([
                new FieldModel({ name: "value", type: "uint8", constraint: "0 to 100" }),
            ]);

            const obj = { value: 200 };

            // Without Supervision, validation fails
            expect(() => validateWith(supervisor, obj)).throws(ConstraintError);

            // After Supervision(obj, "value").constraint = false, validation passes without explicit config
            Supervision(obj, "value").constraint = false;
            expect(() => validateWith(supervisor, obj)).not.throws();
        });

        it("conformance = false does not propagate to children", () => {
            const supervisor = createValidator([
                new FieldModel({
                    name: "nested",
                    type: "struct",
                    children: [new FieldModel({ name: "required", type: "uint8", conformance: "M" })],
                }),
            ]);

            // conformance=false on the struct itself does not disable conformance on children
            const config = new GlobalConfig();
            config.child("nested").config = { conformance: false };
            expect(() => validateWith(supervisor, { nested: {} }, config)).throws();
        });
    });
});
