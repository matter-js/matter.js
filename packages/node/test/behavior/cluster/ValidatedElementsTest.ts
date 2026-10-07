/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientBehavior } from "#behavior/cluster/ClientBehavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterImplementationError, ValidatedElements } from "#behavior/cluster/ValidatedElements.js";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupsServer } from "#behaviors/groups";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { MatterAggregateError, MaybePromise } from "@matter/general";
import type { Model } from "@matter/model";
import { AttributeElement, ClusterModel, CommandElement, EventElement, FieldElement } from "@matter/model";
import { ClusterType } from "@matter/types";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { MockEndpointType } from "../mock-behavior.js";

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

function validate(type: ClusterBehavior.Type, options?: ValidatedElements.Options) {
    return new ValidatedElements(type, undefined, options);
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

        it("excludes an implemented obsolete element as it does a disallowed one", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "X" },
                    CmdB: { id: 2, conformance: "Z" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).false;
            expect(result.commands.has("cmdB")).false;
        });

        it("makes an element depending on an implemented obsolete element absent", () => {
            const schema = makeCluster({
                commands: {
                    CmdA: { id: 1, conformance: "Z" },
                    CmdB: { id: 2, conformance: "CmdA" },
                },
            });

            const type = makeBehaviorType({
                schema,
                implementedCommands: ["cmdA", "cmdB"],
            });

            const result = validate(type);
            expect(result.commands.has("cmdA")).false;
            expect(result.commands.has("cmdB")).false;
        });

        it("reads a misplaced obsolete term in an otherwise list as it reads a disallowed one", () => {
            // "Z, CmdA" is invalid and model validation reports it; the runtime must still not fail on it
            function resultFor(flag: string) {
                const schema = makeCluster({
                    commands: {
                        CmdA: { id: 1, conformance: "O" },
                        CmdB: { id: 2, conformance: `${flag}, CmdA` },
                    },
                });

                const result = validate(makeBehaviorType({ schema, implementedCommands: ["cmdA", "cmdB"] }));
                return { cmdB: result.commands.has("cmdB"), fatal: !!result.errors?.some(e => e.fatal) };
            }

            expect(resultFor("Z")).deep.equal(resultFor("X"));
            expect(resultFor("Z").fatal).false;
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

        it("keeps an attribute whose conformance names the revision, implemented or not", () => {
            const schema = makeCluster({
                attributes: {
                    AttrA: { id: 1, conformance: "Rev >= v3" },
                },
            });

            const implemented = validate(makeBehaviorType({ schema, implementedAttributes: { attrA: 1 } }));
            expect(implemented.attributes.has("attrA")).true;
            expect(implemented.errors?.some(e => e.fatal)).not.ok;

            const unimplemented = validate(makeBehaviorType({ schema }));
            expect(unimplemented.attributes.has("attrA")).false;
            expect(unimplemented.errors?.some(e => e.fatal)).not.ok;
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
    describe("unimplemented mandatory commands", () => {
        const schema = makeCluster({
            features: { FT: { bit: 0, name: "Feature" }, OT: { bit: 1, name: "Other" } },
            supportedFeatures: ["FT"],
            commands: {
                CmdA: { id: 1, conformance: "M" },
                CmdB: { id: 2, conformance: "FT" },
                CmdC: { id: 3, conformance: "OT" },
                CmdD: { id: 4, conformance: "CmdA" },
            },
        });

        function unimplementedOf(result: ValidatedElements) {
            return (result.errors ?? []).filter(({ message }) => message.startsWith("Throws unimplemented exception"));
        }

        it("warns for each mandatory command that throws unimplemented", () => {
            const result = validate(makeBehaviorType({ schema }));

            expect(unimplementedOf(result)).deep.equals([
                { element: "TestBehavior.cmdA", message: "Throws unimplemented exception", fatal: false },
                { element: "TestBehavior.cmdB", message: "Throws unimplemented exception", fatal: false },
            ]);
            expect(result.commands.size).equals(0);
        });

        it("is fatal for each mandatory command that throws unimplemented in strict mode", () => {
            const result = validate(makeBehaviorType({ schema, implementedCommands: ["cmdA"] }), { strict: true });

            expect(unimplementedOf(result)).deep.equals([
                {
                    element: "TestBehavior.cmdB",
                    message: "Throws unimplemented exception, refused by strict validation",
                    fatal: true,
                },
                {
                    element: "TestBehavior.cmdD",
                    message: "Throws unimplemented exception, refused by strict validation",
                    fatal: true,
                },
            ]);
            expect(() => result.report()).throws(ClusterImplementationError);
        });

        it("is fatal for a mandatory command without implementation", () => {
            const type = makeBehaviorType({ schema, implementedCommands: ["cmdB"] });
            Object.defineProperty(type.prototype, "cmdA", { value: undefined });

            const result = validate(type);

            expect(result.errors).deep.equals([
                { element: "TestBehavior.cmdA", message: "Implementation missing", fatal: true },
            ]);
        });

        it("is fatal for a conditionally required command without implementation", () => {
            const type = makeBehaviorType({ schema, implementedCommands: ["cmdA", "cmdB"] });
            Object.defineProperty(type.prototype, "cmdD", { value: undefined });

            const result = validate(type);

            expect(result.errors).deep.equals([
                { element: "TestBehavior.cmdD", message: "Implementation missing", fatal: true },
            ]);
        });

        it("reports a mandatory command that is not a function once", () => {
            const type = makeBehaviorType({ schema, implementedCommands: ["cmdB"] });
            Object.defineProperty(type.prototype, "cmdA", { value: 1 });

            const result = validate(type);

            expect(result.errors).deep.equals([
                { element: "TestBehavior.cmdA", message: "Implementation is not a function", fatal: true },
            ]);
        });

        for (const server of [GroupsServer, ScenesManagementServer, GroupKeyManagementServer]) {
            it(`accepts the default ${server.name} in strict mode`, () => {
                expect(new ValidatedElements(server, undefined, { strict: true }).errors).undefined;
            });
        }

        it("accepts a cluster that implements its mandatory commands in strict mode", () => {
            const result = validate(makeBehaviorType({ schema, implementedCommands: ["cmdA", "cmdB", "cmdD"] }), {
                strict: true,
            });

            expect(result.errors).undefined;
            expect([...result.commands]).deep.equals(["cmdA", "cmdB", "cmdD"]);
        });
    });

    describe("element IDs", () => {
        it("refuses illegal attribute, command and event IDs together", () => {
            const schema = makeCluster({
                attributes: { IllegalAttribute: { id: 0xfff1_5000, conformance: "O" } },
                commands: { IllegalCommand: { id: 0xfff1_0100, conformance: "O" } },
                events: { IllegalEvent: { id: 0xfff1_0100, conformance: "O" } },
            });

            const result = validate(makeBehaviorType({ schema }));

            expect(result.errors?.filter(e => e.fatal).map(e => e.element)).deep.equals([
                "TestBehavior.IllegalAttribute",
                "TestBehavior.IllegalCommand",
                "TestBehavior.IllegalEvent",
            ]);
            expect(() => result.report()).throws(ClusterImplementationError);
        });

        it("refuses an illegal cluster ID", () => {
            const schema = new ClusterModel({ id: 0xfff1_0001, name: "IllegalMei", revision: 1 });

            const result = validate(makeBehaviorType({ schema }));

            expect(result.errors?.find(e => e.element === "TestBehavior.cluster")?.message).match(
                /Invalid cluster ID 0xfff10001/,
            );
        });

        it("accepts a command without a Matter ID", () => {
            const schema = makeCluster({ commands: { LocalOnly: { id: CommandElement.NO_ID, conformance: "O" } } });

            expect(validate(makeBehaviorType({ schema })).errors?.filter(e => e.fatal)).undefined;
        });

        it("reports an illegal ID for every behavior that hosts the schema", () => {
            const schema = makeCluster({ attributes: { IllegalAttribute: { id: 0xfff1_5000, conformance: "O" } } });
            const type = makeBehaviorType({ schema });

            validate(type);

            expect(validate(type).errors?.some(e => e.element === "TestBehavior.IllegalAttribute")).true;
        });

        it("lets a client behavior model a cluster with an illegal ID", () => {
            const namespace = ClusterType({ id: 0xfff1_0001, name: "IllegalMei", revision: 1 });

            expect(() => ClientBehavior(namespace)).not.throws();
        });

        it("fails endpoint initialization for a hosted cluster with an illegal ID", async () => {
            const schema = makeCluster({ attributes: { IllegalAttribute: { id: 0xfff1_5000, conformance: "O" } } });

            const error = await MockEndpoint.create(MockEndpointType.with(makeBehaviorType({ schema }))).then(
                () => undefined,
                (error: unknown) => error,
            );

            const cause = error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
            expect(cause).instanceOf(ClusterImplementationError);
            expect(cause instanceof ClusterImplementationError && String(cause.errors[0])).match(
                /IllegalAttribute.*Invalid attribute ID 0xfff15000/,
            );
        });
    });
});
