/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { MqttServer } from "#behavior/system/mqtt/MqttServer.js";
import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import {
    OtaSoftwareUpdateRequestorBehavior,
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import { Agent } from "#endpoint/Agent.js";
import { BasicObservable, EventEmitter, ImplementationError, Observable } from "@matter/general";
import { DatatypeModel, event, field, FieldElement, nonvolatile, Schema, Scope, uint32 } from "@matter/model";
import { MockEndpoint } from "../endpoint/mock-endpoint.js";

class TestBehavior extends Behavior {
    static override readonly id = "test";
    declare readonly events: TestBehavior.Events;
    declare readonly state: TestBehavior.State;

    constructor(agent: Agent, backing: BehaviorBacking) {
        super(agent, backing);
    }
}

namespace TestBehavior {
    export class State {
        valueOne = 1;
        valueTwo = 2;
    }

    export class Events extends EventEmitter {
        endpointValue$Changed = Observable();
    }
}

function test(what: string, fn: (behavior: TestBehavior) => void) {
    it(what, async () => {
        await using endpoint = await MockEndpoint.createWith(TestBehavior);
        await endpoint.act(agent => {
            const behavior = agent.test;
            fn(behavior);
        });
    });
}

describe("Behavior", () => {
    type IsObject<T> = T extends undefined ? false : T extends object ? true : false;

    test("instantiates with correct properties", behavior => {
        expect(behavior.agent.get(TestBehavior)).equals(behavior);
        expect(behavior.state.valueOne).equals(1);
        expect(behavior.state.valueTwo).equals(2);
        expect(behavior.events.endpointValue$Changed).instanceOf(BasicObservable);
    });

    test("instantiates with correct properties", behavior => {
        expect(behavior.agent.get(TestBehavior)).equals(behavior);
        expect(behavior.state.valueOne).equals(1);
        expect(behavior.state.valueTwo).equals(2);
        expect(behavior.events.endpointValue$Changed).instanceOf(BasicObservable);
    });

    test("unifies state", behavior => {
        const state = behavior.state;

        ({}) as IsObject<typeof state> satisfies true;

        expect(state.valueOne).equals(1);
        expect(state.valueTwo).equals(2);
    });

    it("set creates new type with proper ID and defaults", async () => {
        const NewBehavior = TestBehavior.set({ valueOne: 3 });
        TestBehavior.id satisfies "test";
        NewBehavior.id satisfies "test";

        const endpoint = await MockEndpoint.createWith(NewBehavior);
        await endpoint.act(agent => {
            const behavior = agent.test;

            const state = behavior.state;

            ({}) as IsObject<typeof state> satisfies true;

            expect(state.valueOne).equals(3);
            expect(state.valueTwo).equals(2);
        });
    });

    describe("observer", () => {
        it("triggers on endpoint, emit on endpoint", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            endpoint.events.test.endpointValue$Changed.on(() => {
                emitted = true;
            });
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).true;
        });

        it("triggers on endpoint, emit on behavior", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            endpoint.events.test.endpointValue$Changed.on(() => {
                emitted = true;
            });
            await endpoint.act(agent => agent.test.events.endpointValue$Changed.emit());
            expect(emitted).true;
        });

        it("triggers on behavior, emit on endpoint", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).true;
        });

        it("triggers on behavior, emit on behavior", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            await endpoint.act(agent => agent.test.events.endpointValue$Changed.emit());
            expect(emitted).true;
        });

        it("does not trigger on behavior after close", async () => {
            const endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            await endpoint.close();
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).false;
        });
    });
});

const KEPT_SCHEMA = new DatatypeModel(
    { name: "KeptState", type: "struct" },
    FieldElement({ name: "kept", type: "uint32", quality: "N" }),
);

// Two identical pairs, one per resolution order, because a behavior's schema resolves once and is cached
class ParentResolvedLast extends Behavior {
    static override readonly id = "parentResolvedLast";
    declare state: ParentResolvedLast.State;
    static override readonly schema = KEPT_SCHEMA;
}

namespace ParentResolvedLast {
    export class State {
        kept = 0;
    }
}

class ChildResolvedFirst extends ParentResolvedLast {}

class ParentResolvedFirst extends Behavior {
    static override readonly id = "parentResolvedFirst";
    declare state: ParentResolvedFirst.State;
    static override readonly schema = KEPT_SCHEMA;
}

namespace ParentResolvedFirst {
    export class State {
        kept = 0;
    }
}

class ChildResolvedLast extends ParentResolvedFirst {}

class DecoratedMemberParent extends Behavior {
    static override readonly id = "decoratedMemberParent";
    declare state: DecoratedMemberParent.State;
    static override readonly schema = new DatatypeModel(
        { name: "DecoratedMemberParentState", type: "struct" },
        FieldElement({ name: "kept", type: "uint32", quality: "N" }),
    );
}

namespace DecoratedMemberParent {
    export class State {
        kept = 0;
    }
}

class DecoratedMemberChild extends DecoratedMemberParent {
    @field(uint32)
    extra = 0;
}

class ExtendedRequestor extends OtaSoftwareUpdateRequestorServer {
    declare state: ExtendedRequestor.State;
}

namespace ExtendedRequestor {
    export class State extends OtaSoftwareUpdateRequestorServer.State {
        @field(uint32, nonvolatile)
        extra = 0;
    }
}

class ExtendedDiagnostics extends GeneralDiagnosticsServer {
    declare state: ExtendedDiagnostics.State;
}

namespace ExtendedDiagnostics {
    export class State extends GeneralDiagnosticsServer.State {
        @field(uint32, nonvolatile)
        extra = 0;
    }
}

describe("static schema override", () => {
    it("reaches a subclass resolved before its parent", () => {
        expect([...ChildResolvedFirst.supervisor.persistentKeys()]).contains("kept");
        expect([...ParentResolvedLast.supervisor.persistentKeys()]).contains("kept");
    });

    it("reaches a subclass that decorates its own members, resolved before its parent", () => {
        expect([...DecoratedMemberChild.supervisor.persistentKeys()]).contains("kept");
        expect(memberNames(DecoratedMemberChild)).contains("extra");

        expect([...DecoratedMemberParent.supervisor.persistentKeys()]).contains("kept");
        expect(memberNames(DecoratedMemberParent)).not.contains("extra");
    });

    it("reaches a subclass resolved after its parent (characterization: holds without the fix too)", () => {
        expect([...ParentResolvedFirst.supervisor.persistentKeys()]).contains("kept");
        expect([...ChildResolvedLast.supervisor.persistentKeys()]).contains("kept");
    });

    it("persists the operational hours counter of a general diagnostics subclass", () => {
        class ApplicationDiagnostics extends GeneralDiagnosticsServer {}

        expect([...ApplicationDiagnostics.supervisor.persistentKeys()]).contains("totalOperationalHoursCounter");
    });

    it("converts environment strings to the types a remote server's schema declares", () => {
        const pem = "-----BEGIN CERTIFICATE-----";

        expect(MqttServer.supervisor.cast({ enabled: "false", certificate: pem, key: pem })).deep.equals({
            enabled: false,
            certificate: pem,
            key: pem,
        });
    });

    it("reports what a subclass adds to an inherited override through schema once resolved", () => {
        const { supervisor } = ExtendedRequestor;

        expect(ExtendedRequestor.schema).equals(supervisor.schema);
        expect(memberNames(ExtendedRequestor)).contains("extra");
    });

    it("keeps a subclass's own state fields when the subclass derives a cluster variant", () => {
        for (const variant of [
            ExtendedDiagnostics.with(),
            ExtendedDiagnostics.enable({}),
            ExtendedDiagnostics.alter({}),
        ]) {
            const keys = [...variant.supervisor.persistentKeys()];
            expect(keys).contains("extra");
            expect(keys).contains("totalOperationalHoursCounter");
        }
    });
});

class DeclaringParent extends Behavior {
    static override readonly id = "declaringParent";
    declare state: DeclaringParent.State;
}

namespace DeclaringParent {
    export class State {
        @field(uint32, nonvolatile)
        kept = 0;
    }
}

class DeclaringChild extends DeclaringParent {
    declare state: DeclaringChild.State;
    static override readonly schema = new DatatypeModel(
        { name: "DeclaringChildState", type: "struct" },
        FieldElement({ name: "own", type: "uint32", quality: "N" }),
    );
}

namespace DeclaringChild {
    export class State extends DeclaringParent.State {
        own = 0;

        @field(uint32, nonvolatile)
        more = 0;
    }
}

class RedeclaringParent extends Behavior {
    static override readonly id = "redeclaringParent";
    declare state: RedeclaringParent.State;
    static override readonly schema = new DatatypeModel(
        { name: "RedeclaringParentState", type: "struct" },
        FieldElement({ name: "kept", type: "uint32", quality: "N" }),
    );
}

namespace RedeclaringParent {
    export class State {
        kept = 0;
    }
}

class RedeclaringSchemaChild extends RedeclaringParent {
    declare state: RedeclaringSchemaChild.State;
    static override readonly schema = RedeclaringParent.schema;
}

namespace RedeclaringSchemaChild {
    export class State extends RedeclaringParent.State {
        @field(uint32, nonvolatile)
        leaked = 0;
    }
}

class AssignedParent extends Behavior {
    static override readonly id = "assignedParent";
    static override readonly schema = new DatatypeModel(
        { name: "AssignedParentState", type: "struct" },
        FieldElement({ name: "kept", type: "uint32", quality: "N" }),
    );
}

class DecoratedParent extends Behavior {
    static override readonly id = "decoratedParent";
    declare state: DecoratedParent.State;
    declare events: DecoratedParent.Events;
}

namespace DecoratedParent {
    export class State {
        @field(uint32, nonvolatile)
        kept = 0;
    }

    export class Events extends EventEmitter {
        @event(0)
        happened = Observable();
    }
}

class DecoratedChild extends DecoratedParent {}

class RedeclaringChild extends DecoratedParent {
    static override readonly Events = DecoratedParent.Events;
}

class ConfiguredParent extends Behavior {
    static override readonly id = "configuredParent";
    declare state: ConfiguredParent.State;
}

namespace ConfiguredParent {
    export class State {
        @field(uint32, nonvolatile)
        kept = 0;
    }
}

class AccessorOverride extends Behavior {
    static override readonly id = "accessorOverride";

    static override get schema() {
        return KEPT_SCHEMA;
    }
}

function memberNames(type: Behavior.Type) {
    const schema = Schema.Required(type);
    return Scope(schema)
        .membersOf(schema)
        .map(({ name }) => name);
}

describe("schema isolation", () => {
    it("leaves a parent's decorated state and events with the parent when a subclass resolves first", () => {
        expect([...DecoratedChild.supervisor.persistentKeys()]).contains("kept");
        expect([...DecoratedParent.supervisor.persistentKeys()]).contains("kept");
        expect(Schema(DecoratedParent.State)).equals(Schema(DecoratedParent));
        expect(Schema(DecoratedParent.Events)).equals(Schema(DecoratedParent));
    });

    it("leaves a parent's decorated events with the parent when a subclass redeclares them", () => {
        expect([...RedeclaringChild.supervisor.persistentKeys()]).contains("kept");
        expect(Schema(DecoratedParent.Events)).equals(Schema(DecoratedParent));
    });

    it("leaves a parent's decorated state with the parent when a configured variant reuses it", () => {
        const configured = ConfiguredParent.set({});
        expect(configured.State).equals(ConfiguredParent.State);

        expect([...configured.supervisor.persistentKeys()]).contains("kept");
        expect(Schema(ConfiguredParent.State)).equals(Schema(ConfiguredParent));
        expect(() => ConfiguredParent.set({}).supervisor).not.throws();
    });

    it("keeps a server's static override out of the cluster and client models (characterization)", () => {
        class ApplicationRequestor extends OtaSoftwareUpdateRequestorServer {}

        expect(memberNames(ApplicationRequestor)).contains("updateInProgressDetails");

        for (const shared of [OtaSoftwareUpdateRequestorBehavior, OtaSoftwareUpdateRequestorClient]) {
            expect(memberNames(shared)).not.contains("updateInProgressDetails");
        }
    });

    it("rejects a schema accessor on a subclass", () => {
        expect(() => AccessorOverride.supervisor).throws(ImplementationError, /AccessorOverride/);
    });

    it("resolves the parent first when a subclass declares its own schema", () => {
        const childKeys = [...DeclaringChild.supervisor.persistentKeys()];
        expect(childKeys).contains("own");
        expect(childKeys).contains("more");

        expect([...DeclaringParent.supervisor.persistentKeys()]).contains("kept");
        expect(memberNames(DeclaringParent)).not.contains("more");
    });

    it("keeps a subclass's state out of a parent schema the subclass redeclares", () => {
        expect([...RedeclaringSchemaChild.supervisor.persistentKeys()]).contains("leaked");
        expect(memberNames(RedeclaringParent)).not.contains("leaked");
    });

    it("accepts an assigned schema once the parent resolved", () => {
        expect([...AssignedParent.supervisor.persistentKeys()]).contains("kept");

        class AssignedChild extends AssignedParent {}
        const assigned = new DatatypeModel(
            { name: "AssignedChildState", type: "struct" },
            FieldElement({ name: "other", type: "uint32", quality: "N" }),
        );

        expect(Reflect.set(AssignedChild, "schema", assigned)).true;
        expect([...AssignedChild.supervisor.persistentKeys()]).deep.equals(["other"]);
        expect([...AssignedParent.supervisor.persistentKeys()]).deep.equals(["kept"]);
    });

    it("gives the base behavior an empty schema", () => {
        expect(Behavior.schema).equals(Schema.empty);
    });
});
