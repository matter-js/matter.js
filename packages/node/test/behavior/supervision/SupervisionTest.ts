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
import { ClusterModel, CommandModel, DataModelPath, FieldModel } from "@matter/model";
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
            expect(config.supervision).undefined;
            config.supervision = { constraint: false };
            expect(config.supervision).deep.equals({ constraint: false });
        });
    });

    describe("LocalConfig", () => {
        it("inherits global config when no local override", () => {
            const global = new GlobalConfig();
            global.supervision = { validate: false };
            const local = new LocalConfig(global);
            expect(local.supervision).deep.equals({ validate: false });
        });

        it("local overrides shadow global", () => {
            const global = new GlobalConfig();
            global.supervision = { validate: false, conformance: true };
            const local = new LocalConfig(global);
            local.supervision = { constraint: false };
            expect(local.supervision).deep.equals({ constraint: false });
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
            global.child("foo").supervision = { constraint: false };
            const local = new LocalConfig(global);
            const child = local.readonlyChild("foo");
            expect(child).not.undefined;
            expect(child!.supervision).deep.equals({ constraint: false });
        });

        it("local child does not affect global", () => {
            const global = new GlobalConfig();
            const local = new LocalConfig(global);
            const child = local.child("foo");
            child.supervision = { constraint: false };
            // Global should not have this child's config
            expect(global.readonlyChild("foo")?.supervision).undefined;
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
            config.child("value").supervision = { constraint: false };
            expect(() => validateWith(supervisor, { value: 200 }, config)).not.throws();
        });

        it("skips conformance validation when conformance is disabled", () => {
            const supervisor = createValidator([new FieldModel({ name: "required", type: "uint8", conformance: "M" })]);

            // Without config, missing mandatory field should fail
            expect(() => validateWith(supervisor, {})).throws();

            // With conformance disabled, missing mandatory field should pass
            const config = new GlobalConfig();
            config.child("required").supervision = { conformance: false };
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
            config.child("value").supervision = { validate: false };
            expect(() => validateWith(supervisor, {}, config)).not.throws();
            expect(() => validateWith(supervisor, { value: 200 }, config)).not.throws();
        });

        it("validates unconfigured fields normally", () => {
            const supervisor = createValidator([
                new FieldModel({ name: "configured", type: "uint8", constraint: "0 to 100" }),
                new FieldModel({ name: "normal", type: "uint8", constraint: "0 to 50" }),
            ]);

            const config = new GlobalConfig();
            config.child("configured").supervision = { constraint: false };

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
            config.child("items").child("entry").supervision = { constraint: false };
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
            itemsConfig.child("entry").supervision = { constraint: false };
            itemsConfig.child(1).supervision = { constraint: true };

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
            config.child("nested").supervision = { validate: false };
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
            config.child("nested").supervision = { conformance: false };
            expect(() => validateWith(supervisor, { nested: {} }, config)).throws();
        });
    });

    describe("constructor overloads", () => {
        // Mock behavior classes for testing
        class BaseBehavior {
            myCommand(_request: { myField: number; otherField: string }) {}
            otherCommand(_request: { value: number }) {}
        }

        class UnrelatedBehavior {
            someMethod() {}
        }

        it("stores and retrieves config for a constructor method", () => {
            Supervision(BaseBehavior, "myCommand", "myField").constraint = false;

            const config = maybeConfigOf(BaseBehavior, "myCommand");
            expect(config).not.undefined;

            const fieldConfig = config!.readonlyChild("myField");
            expect(fieldConfig).not.undefined;
            expect(fieldConfig!.supervision).deep.equals({ constraint: false });
        });

        it("returns undefined for unconfigured constructor", () => {
            expect(maybeConfigOf(UnrelatedBehavior, "someMethod")).undefined;
        });

        it("independent methods do not leak config", () => {
            Supervision(BaseBehavior, "myCommand", "myField").constraint = false;

            const config = maybeConfigOf(BaseBehavior, "otherCommand");

            // otherCommand has no config on BaseBehavior (unless previously set)
            // Check that myField config is not leaking
            if (config !== undefined) {
                expect(config.readonlyChild("myField")).undefined;
            }
        });

        it("nested field paths create correct tree", () => {
            class NestedBehavior {
                cmd(_request: { credential: { credentialIndex: number } }) {}
            }

            Supervision(NestedBehavior, "cmd", "credential", "credentialIndex").constraint = false;

            const config = maybeConfigOf(NestedBehavior, "cmd");
            expect(config).not.undefined;

            const credentialConfig = config!.readonlyChild("credential");
            expect(credentialConfig).not.undefined;

            const indexConfig = credentialConfig!.readonlyChild("credentialIndex");
            expect(indexConfig).not.undefined;
            expect(indexConfig!.supervision).deep.equals({ constraint: false });
        });

        it("prototype chain merges base and derived configs", () => {
            class MergeBase {
                cmd(_request: { fieldA: number; fieldB: number }) {}
            }

            class MergeDerived extends MergeBase {}

            Supervision(MergeBase, "cmd", "fieldA").constraint = false;
            Supervision(MergeDerived, "cmd", "fieldB").conformance = false;

            const config = maybeConfigOf(MergeDerived, "cmd");
            expect(config).not.undefined;

            // fieldA from base
            const fieldA = config!.readonlyChild("fieldA");
            expect(fieldA).not.undefined;
            expect(fieldA!.supervision).deep.equals({ constraint: false });

            // fieldB from derived
            const fieldB = config!.readonlyChild("fieldB");
            expect(fieldB).not.undefined;
            expect(fieldB!.supervision).deep.equals({ conformance: false });
        });

        it("subclass override wins over base", () => {
            class OverrideBase {
                cmd(_request: { field: number }) {}
            }

            class OverrideDerived extends OverrideBase {}

            Supervision(OverrideBase, "cmd", "field").constraint = false;
            Supervision(OverrideDerived, "cmd", "field").constraint = true;

            const config = maybeConfigOf(OverrideDerived, "cmd");
            expect(config).not.undefined;

            const fieldConfig = config!.readonlyChild("field");
            expect(fieldConfig).not.undefined;
            expect(fieldConfig!.supervision!.constraint).equals(true);
        });

        it("command-level config without field path", () => {
            class CmdBehavior {
                cmd(_request: { value: number }) {}
            }

            const sup = Supervision(CmdBehavior, "cmd");
            sup.validate = false;

            const retrieved = maybeConfigOf(CmdBehavior, "cmd");
            expect(retrieved).not.undefined;
            expect(retrieved!.supervision).deep.equals({ validate: false });
        });

        it("validation respects constructor config", () => {
            class ValidBehavior {
                myCmd(_request: { value: number }) {}
            }

            const cluster = new ClusterModel({
                name: "TestCluster",
                children: [
                    new CommandModel({
                        name: "MyCmd",
                        id: 0x1,
                        direction: "request",
                        children: [new FieldModel({ name: "Value", type: "uint8", constraint: "0 to 100" })],
                    }),
                ],
            });

            const supervisor = RootSupervisor.for(cluster);
            const cmdModel = cluster.commands.require("MyCmd");
            const validate = supervisor.get(cmdModel).validate;

            // Without config, 200 should fail
            expect(() =>
                validate!({ value: 200 }, LocalActorContext.ReadOnly, {
                    path: new DataModelPath(cmdModel.path),
                }),
            ).throws(ConstraintError);

            // With constructor config suppressing constraint on "value"
            Supervision(ValidBehavior, "myCmd", "value").constraint = false;
            const config = maybeConfigOf(ValidBehavior, "myCmd");

            // With config, 200 should pass
            expect(() =>
                validate!({ value: 200 }, LocalActorContext.ReadOnly, {
                    path: new DataModelPath(cmdModel.path),
                    config,
                }),
            ).not.throws();
        });
    });
});
