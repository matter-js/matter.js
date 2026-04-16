/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ValidatedElements } from "#behavior/cluster/ValidatedElements.js";
import { MaybePromise } from "@matter/general";
import type { Model } from "@matter/model";
import { AttributeElement, ClusterModel, CommandElement, EventElement, FieldElement } from "@matter/model";
import { ClusterType } from "@matter/types";

function makeCluster(options: {
    commands?: Record<string, { id: number; conformance: string; response?: string; direction?: string }>;
    attributes?: Record<string, { id: number; conformance: string }>;
    events?: Record<string, { id: number; conformance: string }>;
    features?: Record<string, { bit: number; name: string }>;
    supportedFeatures?: string[];
}) {
    const children: Model.ChildDefinition<ClusterModel>[] = [];

    if (options.features) {
        const featureFields = [];
        for (const [abbrev, { bit, name }] of Object.entries(options.features)) {
            featureFields.push(FieldElement({ name: abbrev, constraint: `${bit}`, description: name }));
        }
        children.push(
            AttributeElement(
                {
                    name: "FeatureMap",
                    id: 0xfffc,
                    type: "FeatureMap",
                },
                ...featureFields,
            ),
        );
    }

    if (options.attributes) {
        for (const [name, { id, conformance }] of Object.entries(options.attributes)) {
            children.push(AttributeElement({ id, name, type: "uint8", conformance }));
        }
    }

    if (options.commands) {
        for (const [name, { id, conformance, response, direction }] of Object.entries(options.commands)) {
            children.push(
                CommandElement({
                    id,
                    name,
                    type: "uint8",
                    conformance,
                    response: response ?? "status",
                    direction: direction as "request" | "response" | undefined,
                }),
            );
        }
    }

    if (options.events) {
        for (const [name, { id, conformance }] of Object.entries(options.events)) {
            children.push(EventElement({ id, name, type: "uint8", conformance, priority: "info" }));
        }
    }

    const schema = new ClusterModel(
        {
            id: 0xfff1_fc01,
            name: "TestCluster",
        },
        ...children,
    );

    if (options.supportedFeatures?.length) {
        schema.supportedFeatures = new Set(options.supportedFeatures) as never;
    }

    schema.finalize();
    return schema;
}

/**
 * Build a ClusterBehavior.Type for testing ValidatedElements using proper ClusterBehavior.for().
 */
function makeBehaviorType(options: {
    schema: ClusterModel;
    implementedCommands?: string[];
    implementedAttributes?: Record<string, unknown>;
    implementedEvents?: string[];
}) {
    // Build a proper ClusterType from the schema
    interface EmptyInterface {
        Components: [
            {
                flags: {};
                commands: Record<string, (...args: never[]) => MaybePromise>;
            },
        ];
    }
    const cluster = ClusterType(options.schema) as ClusterType.Concrete & { Typing: EmptyInterface };
    const BaseBehavior = ClusterBehavior.for(cluster);

    // Build State defaults
    const stateDefaults: Record<string, unknown> = {};
    if (options.implementedAttributes) {
        for (const attr of options.schema.attributes) {
            const propName = attr.propertyName;
            if (propName in options.implementedAttributes) {
                stateDefaults[propName] = options.implementedAttributes[propName];
            }
        }
    }

    // Build the behavior class with command implementations
    const implCmds = new Set(options.implementedCommands ?? []);
    const implEvents = new Set(options.implementedEvents ?? []);

    class TestBehavior extends BaseBehavior {
        static {
            // Set state defaults
            const defaults = stateDefaults;
            const StateClass = class extends BaseBehavior.State {
                constructor() {
                    super();
                    Object.assign(this, defaults);
                }
            };
            Object.defineProperty(this, "State", { value: StateClass, configurable: true });

            // Set event emitters
            if (implEvents.size) {
                const EventsClass = class extends BaseBehavior.Events {};
                for (const evt of implEvents) {
                    Object.defineProperty(EventsClass.prototype, evt, {
                        value: {},
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                Object.defineProperty(this, "Events", { value: EventsClass, configurable: true });
            }
        }
    }

    // Add command implementations to the prototype
    for (const cmd of options.schema.commands) {
        if (cmd.isResponse) {
            continue;
        }
        const propName = cmd.propertyName;
        if (implCmds.has(propName)) {
            Object.defineProperty(TestBehavior.prototype, propName, {
                value: () => {},
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
    }

    Object.defineProperty(TestBehavior, "name", { value: "TestBehavior" });

    return TestBehavior as ClusterBehavior.Type;
}

function validate(type: ClusterBehavior.Type) {
    return new ValidatedElements(type);
}

describe("ValidatedElements", () => {
    describe("element conformance resolution", () => {
        it("dep present makes element mandatory", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "M" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).true;
            expect(result.commands.has("cmdB")).true;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("dep absent makes element absent", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: [],
            });

            const result = validate(type);
            expect(result.commands.has("cmdB")).false;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("optional fallback when dep absent and element implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "CmdA, O" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdB")).true;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("optional fallback when dep absent and element not implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "CmdA, O" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: [],
            });

            const result = validate(type);
            expect(result.commands.has("cmdB")).false;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("cyclic pair both implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "CmdB, O" },
                    CmdB: { id: 2, conformance: "CmdA, O" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).true;
            expect(result.commands.has("cmdB")).true;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("cyclic pair neither implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "CmdB, O" },
                    CmdB: { id: 2, conformance: "CmdA, O" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: [],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).false;
            expect(result.commands.has("cmdB")).false;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("OR deps one present", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "M" },
                    CmdB: { id: 2, conformance: "X" },
                    CmdC: { id: 3, conformance: "CmdA | CmdB" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdC"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdC")).true;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("OR deps none present", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "X" },
                    CmdC: { id: 3, conformance: "CmdA | CmdB" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: [],
            });

            const result = validate(type);
            expect(result.commands.has("cmdC")).false;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("OperationalState-like scenario", () => {
            const schema = makeCluster({
                commands: {
                    Pause: { id: 1, conformance: "Resume, O" },
                    Resume: { id: 2, conformance: "Pause, O" },
                    Stop: { id: 3, conformance: "M" },
                    Start: { id: 4, conformance: "Stop" },
                    OperationalCommandResponse: {
                        id: 5,
                        conformance: "Pause | Stop | Start | Resume",
                        direction: "response",
                    },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["pause", "resume", "stop", "start"],
            });

            const result = validate(type);
            expect(result.commands.has("pause")).true;
            expect(result.commands.has("resume")).true;
            expect(result.commands.has("stop")).true;
            expect(result.commands.has("start")).true;
            expect(result.errors?.some(e => e.fatal)).not.ok;
        });

        it("errors when mandatory element not implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "M" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA"],
            });

            const result = validate(type);
            // CmdB is structurally present (as Behavior.unimplemented stub from ClusterBehavior.for)
            // but not truly implemented — expect a non-fatal warning
            expect(result.errors?.some(e => e.element === "TestBehavior.cmdB" && !e.fatal)).true;
        });

        it("warns when disallowed element is implemented", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdB"],
            });

            const result = validate(type);
            expect(result.errors?.some(e => e.element === "TestBehavior.cmdB" && !e.fatal)).true;
            expect(result.commands.has("cmdB")).false;
        });

        it("handles attributes with element references", () => {
            const schema = makeCluster({
                attributes: {
                    AttrA: { id: 1, conformance: "M" },
                    AttrB: { id: 2, conformance: "AttrA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedAttributes: { attrA: 1, attrB: 2 },
            });

            const result = validate(type);
            expect(result.attributes.has("attrA")).true;
            expect(result.attributes.has("attrB")).true;
        });

        it("handles feature-gated elements correctly", () => {
            const schema = makeCluster({
                features: { FT: { bit: 0, name: "Feature" } },
                supportedFeatures: ["FT"],
                commands: {
                    CmdA: { id: 1, conformance: "FT" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).true;
            expect(result.commands.has("cmdB")).true;
        });
    });
});
