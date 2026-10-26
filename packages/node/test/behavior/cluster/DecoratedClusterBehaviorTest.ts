/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { GlobalAttributeState } from "#behavior/cluster/ClusterState.js";
import { OnlineEvent } from "#behavior/Events.js";
import { ActionsServer } from "#behaviors/actions";
import { IdentifyBehavior, IdentifyServer } from "#behaviors/identify";
import { OnOffServer } from "#behaviors/on-off";
import { ImplementationError, Observable } from "@matter/general";
import {
    attribute,
    cluster,
    ClusterModel,
    EventModel,
    command,
    event,
    field,
    response,
    Schema,
    string,
    uint32,
    uint8,
    writable,
} from "@matter/model";
import { NumberedOccurrence, OccurrenceManager } from "@matter/protocol";
import { ClusterType, Priority } from "@matter/types";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { MockEndpointType } from "../mock-behavior.js";

const CUSTOM_CLUSTER_ID = 0xfff1fc00;

/** A manufacturer-specific cluster declared with the model decorators rather than generated from the Matter model. */
@cluster(CUSTOM_CLUSTER_ID, "Custom")
class CustomServer extends ClusterBehavior {
    static override readonly id = "custom";

    declare state: CustomServer.State;
}

namespace CustomServer {
    export class State {
        @attribute(0, uint8, writable)
        value = 0;
    }
}

// Manufacturer-specific IDs carry the vendor prefix in the upper 16 bits (Matter Core § 7.21.2.1)
const VENDOR_ATTRIBUTE_ID = 0xfff1_0000;
const VENDOR_COMMAND_ID = 0xfff1_0001;

class VendorRequest {
    @field(0, string)
    note!: string;
}

class VendorResponse {
    @field(0, uint32)
    count!: number;
}

/** A standard cluster extended with a manufacturer-specific attribute and command. */
class VendorOnOffServer extends OnOffServer {
    declare state: VendorOnOffServer.State;

    @command(VENDOR_COMMAND_ID, VendorRequest)
    @response(VendorResponse)
    vendorThing(request: VendorRequest): VendorResponse {
        return { count: request.note.length };
    }
}

namespace VendorOnOffServer {
    export class State extends OnOffServer.State {
        @attribute(VENDOR_ATTRIBUTE_ID, uint32)
        vendorCounter = 0;
    }
}

/** A subclass that only changes a default of a decorated cluster, declared before anything resolved the parent. */
class CustomDefaultServer extends CustomServer {
    declare state: CustomDefaultServer.State;
}

namespace CustomDefaultServer {
    export class State extends CustomServer.State {
        override value = 5;
    }
}

@cluster(0xfff1fc01, "NoId")
class NoIdServer extends ClusterBehavior {}

namespace NoIdServer {
    export class State {
        @attribute(0, uint8)
        value = 0;
    }
}

@cluster(0xfff1fc04, "Untouched")
class UntouchedServer extends ClusterBehavior {}

namespace UntouchedServer {
    export class State {
        @attribute(0, uint8)
        value = 0;
    }
}

@cluster(0xfff1fc02, "Preset")
class PresetServer extends ClusterBehavior {
    static override readonly id = "preset";
}

namespace PresetServer {
    export class State {
        @attribute(0, uint8, writable)
        value = 0;
    }
}

/** A standard cluster with a feature selected, extended with a manufacturer-specific attribute. */
class VendorLightingServer extends OnOffServer.with("Lighting") {
    declare state: VendorLightingServer.State;
}

namespace VendorLightingServer {
    export class State extends OnOffServer.with("Lighting").State {
        @attribute(VENDOR_ATTRIBUTE_ID, uint32)
        vendorCounter = 0;
    }
}

class EventfulPayload {
    @field(0, uint8)
    level!: number;
}

@cluster(0xfff1fc09, "Eventful")
class EventfulServer extends ClusterBehavior {
    declare state: EventfulServer.State;
    declare events: EventfulServer.Events;
}

namespace EventfulServer {
    export class State {
        @attribute(0, uint8, writable)
        value = 0;
    }

    export class Events extends ClusterBehavior.Events {
        @event(0, EventfulPayload)
        happened = Observable<[payload: EventfulPayload]>();

        /** Added by the derivation; a decorated Events class does not type the attribute events. */
        declare value$Changed: Observable<[value: number]>;
    }
}

/** A global attribute as the behavior serves it; a decorated State does not type the globals. */
function globalOf(state: object, name: keyof GlobalAttributeState) {
    return Reflect.get(state, name);
}

describe("ClusterBehavior declared with the model decorators", () => {
    it("serves the global attributes", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(CustomServer));

        const state = endpoint.stateOf(CustomServer);

        expect(globalOf(state, "clusterRevision")).equals(1);
        expect(globalOf(state, "featureMap")).deep.equals({});
        expect(globalOf(state, "attributeList")).deep.equals([0, 0xfff8, 0xfff9, 0xfffb, 0xfffc, 0xfffd]);
        expect(globalOf(state, "acceptedCommandList")).deep.equals([]);
        expect(globalOf(state, "generatedCommandList")).deep.equals([]);
    });

    it("is listed in the Descriptor ServerList", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType);
        const changed = new Promise<void>(resolve =>
            endpoint.events.descriptor.serverList$Changed.once(() => resolve()),
        );
        endpoint.behaviors.require(CustomServer);
        await changed;

        expect(endpoint.state.descriptor.serverList).deep.equals([29, CUSTOM_CLUSTER_ID]);
    });

    it("lists a manufacturer-specific attribute and command added to a standard cluster", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(VendorOnOffServer));

        const state = endpoint.stateOf(VendorOnOffServer);

        expect(globalOf(state, "attributeList")).deep.equals([
            0,
            0xfff8,
            0xfff9,
            0xfffb,
            0xfffc,
            0xfffd,
            VENDOR_ATTRIBUTE_ID,
        ]);
        expect(globalOf(state, "acceptedCommandList")).deep.equals([0, 1, 2, VENDOR_COMMAND_ID]);
        expect(globalOf(state, "generatedCommandList")).deep.equals([VENDOR_COMMAND_ID]);
        expect(endpoint.state.descriptor.serverList).deep.equals([29, 6]);
    });

    it("gives a new cluster its namespace and the class-level properties a generated class has", () => {
        expect(CustomServer.cluster.id).equals(CUSTOM_CLUSTER_ID);
        expect(CustomServer.cluster.schema).equals(Schema(CustomServer));
        expect(CustomServer.features).deep.equals({});
    });

    it("resolves a class's decorations when its namespace is read first", () => {
        expect(UntouchedServer.cluster.id).equals(0xfff1fc04);
    });

    it("rebuilds the namespace of a standard cluster it extends with manufacturer-specific elements", () => {
        expect(VendorOnOffServer.cluster.id).equals(6);
        expect(VendorOnOffServer.cluster.schema.attributes(VENDOR_ATTRIBUTE_ID)).not.undefined;
        expect(OnOffServer.cluster.schema.attributes(VENDOR_ATTRIBUTE_ID)).undefined;
    });

    it("keeps the selected features of a standard cluster it extends", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(VendorLightingServer));

        expect(VendorLightingServer.features.lighting).true;
        expect(globalOf(endpoint.stateOf(VendorLightingServer), "featureMap")).deep.include({ lighting: true });
    });

    it("leaves a generated server whose State only adds internal fields as it is", () => {
        Schema(IdentifyServer);

        expect(IdentifyServer.cluster).equals(IdentifyBehavior.cluster);
    });

    it("derives the State of a subclass that only changes a default", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(CustomDefaultServer));

        const state = endpoint.stateOf(CustomDefaultServer);
        expect(CustomDefaultServer.id).equals("custom");
        expect(state.value).equals(5);
        expect(globalOf(state, "clusterRevision")).equals(1);
    });

    it("names a class without an ID after its cluster", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType);
        const changed = new Promise<void>(resolve =>
            endpoint.events.descriptor.serverList$Changed.once(() => resolve()),
        );
        endpoint.behaviors.require(NoIdServer);
        await changed;

        expect(NoIdServer.id).equals("noId");
        expect(endpoint.behaviors.has(NoIdServer)).true;
    });

    it("derives defaults set on a class nothing resolved yet", async () => {
        const Preset = PresetServer.set({ value: 3 });
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(Preset));

        const state = endpoint.stateOf(Preset);
        expect(state.value).equals(3);
        expect(globalOf(state, "clusterRevision")).equals(1);
    });

    it("keeps a namespace a subclass assigns itself", () => {
        class Assigned extends ClusterBehavior {}
        Reflect.set(Assigned, "cluster", OnOffServer.cluster);
        Schema(Assigned);

        expect(Assigned.cluster).equals(OnOffServer.cluster);
    });

    it("keeps features a subclass assigns itself next to its derived namespace", () => {
        @cluster(0xfff1fc06, "Assigning")
        class AssigningServer extends ClusterBehavior {}
        Reflect.set(AssigningServer, "features", { custom: true });

        expect(AssigningServer.cluster.id).equals(0xfff1fc06);
        expect(AssigningServer.features).deep.equals({ custom: true });
    });

    it("gives a class without a cluster schema no cluster", () => {
        class BareServer extends ClusterBehavior {}

        expect(BareServer.cluster).equals(ClusterType.Unknown);
        expect(BareServer.id).undefined;
    });

    it("keeps an ID a subclass of a generated class assigns itself", () => {
        class RenamedServer extends OnOffServer {}
        Reflect.set(RenamedServer, "id", "renamed");

        expect(RenamedServer.id).equals("renamed");
    });

    it("accepts a derived State whose schema something resolved", async () => {
        Schema(UntouchedServer);
        Schema(UntouchedServer.State);

        await using endpoint = await MockEndpoint.create(MockEndpointType.with(UntouchedServer));

        expect(endpoint.stateOf(UntouchedServer).value).equals(0);
    });

    it("keeps the derived ID of its parent for a subclass with its own decorations", () => {
        @cluster(0xfff1fc0b, "Derived")
        class DerivedServer extends ClusterBehavior {}

        class DerivedChildServer extends DerivedServer {
            @command(1, VendorRequest)
            extra(_request: VendorRequest) {}
        }

        expect(DerivedChildServer.cluster.schema.commands(1)).not.undefined;
        expect(DerivedChildServer.id).equals("derived");
    });

    it("gives a new cluster without elements its namespace", () => {
        @cluster(0xfff1fc0a, "Empty")
        class EmptyServer extends ClusterBehavior {}

        expect(EmptyServer.cluster.id).equals(0xfff1fc0a);
        expect(EmptyServer.id).equals("empty");
    });

    it("gives a cluster schema without an ID no cluster", () => {
        class AnonymousServer extends ClusterBehavior {
            static override readonly schema = new ClusterModel({ name: "Anonymous" });
        }

        expect(AnonymousServer.cluster).equals(ClusterType.Unknown);
    });

    it("refuses a namespace assigned once the schema is resolved", () => {
        Schema(CustomServer);

        expect(() => Reflect.set(CustomServer, "cluster", OnOffServer.cluster)).throws(
            ImplementationError,
            "because its schema is resolved",
        );
    });

    it("gives a subclass that adds nothing the namespace and features of its parent", () => {
        class PlainServer extends OnOffServer.with("Lighting") {}

        expect(PlainServer.cluster).equals(OnOffServer.with("Lighting").cluster);
        expect(PlainServer.features).equals(OnOffServer.with("Lighting").features);
    });

    it("supports a class without an ID nothing resolved yet", async () => {
        @cluster(0xfff1fc05, "Unresolved")
        class UnresolvedServer extends ClusterBehavior {}

        await using endpoint = await MockEndpoint.create(MockEndpointType.with(UnresolvedServer));

        expect(endpoint.behaviors.has(UnresolvedServer)).true;
        expect(UnresolvedServer.id).equals("unresolved");
    });

    it("derives the namespace of a standard cluster subclass read first", () => {
        class FreshVendorServer extends OnOffServer {
            @command(VENDOR_COMMAND_ID, VendorRequest)
            vendorThing(_request: VendorRequest) {}
        }

        expect(FreshVendorServer.cluster.schema.commands(VENDOR_COMMAND_ID)).not.undefined;
    });

    it("keeps manufacturer-specific elements when selecting features of a class nothing resolved yet", () => {
        class FreshVendorServer extends OnOffServer {
            @command(VENDOR_COMMAND_ID, VendorRequest)
            vendorThing(_request: VendorRequest) {}
        }

        const Lighting = FreshVendorServer.with("Lighting");

        expect(Lighting.cluster.schema.commands(VENDOR_COMMAND_ID)).not.undefined;
        expect(Lighting.features.lighting).true;
    });

    it("refuses a different cluster ID on a subclass of a standard cluster, on every access", () => {
        @cluster(0xfff1fc10, "Moved")
        class MovedServer extends OnOffServer {}

        const expected = "declares cluster 0xfff1fc10 but extends OnOffServer for cluster 0x00000006";
        expect(() => MovedServer.cluster).throws(ImplementationError, expected);
        expect(() => MovedServer.cluster).throws(ImplementationError, expected);
        expect(() => Schema(MovedServer)).throws(ImplementationError, expected);
    });

    it("refuses a different cluster ID on a subclass of a decorated cluster", () => {
        @cluster(0xfff1fc11, "Moved")
        class MovedServer extends CustomServer {}

        expect(() => MovedServer.cluster).throws(
            ImplementationError,
            "but extends CustomServer for cluster 0xfff1fc00",
        );
    });

    it("keeps the State of a class that declares its namespace as a static field", () => {
        class DeclaredServer extends OnOffServer {
            static override readonly cluster = OnOffServer.cluster;

            @command(VENDOR_COMMAND_ID, VendorRequest)
            vendorThing(_request: VendorRequest) {}
        }
        Schema(DeclaredServer);

        expect(DeclaredServer.cluster).equals(OnOffServer.cluster);
        expect(DeclaredServer.State).equals(OnOffServer.State);
    });

    it("refuses to read the namespace while the schema resolves", () => {
        @cluster(0xfff1fc08, "Reentrant")
        class ReentrantServer extends ClusterBehavior {}

        class ReentrantState {
            @attribute(0, uint8)
            value = 0;

            features = ReentrantServer.features;
        }
        Reflect.set(ReentrantServer, "State", ReentrantState);

        expect(() => Schema(ReentrantServer)).throws(ImplementationError, "while its schema resolves");
    });

    it("serves the attribute events of a new cluster", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(EventfulServer));
        const events = endpoint.eventsOf(EventfulServer);
        const changed = new Promise<number>(resolve => events.value$Changed.once(value => resolve(value)));

        await endpoint.setStateOf(EventfulServer, { value: 7 });

        expect(await changed).equals(7);
    });

    it("records an event a new cluster declares", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(EventfulServer));

        await endpoint.act(agent => {
            agent.get(EventfulServer).events.happened.emit({ level: 3 });
        });

        const occurrences = new Array<NumberedOccurrence>();
        for await (const occurrence of endpoint.env.get(OccurrenceManager).get()) {
            if (occurrence.clusterId === 0xfff1fc09 && occurrence.eventId === 0) {
                occurrences.push(occurrence);
            }
        }
        expect(occurrences.map(({ payload, priority }) => ({ payload, priority }))).deep.equals([
            { payload: { level: 3 }, priority: Priority.Info },
        ]);
    });

    it("records an event its Events class assigns in the constructor", async () => {
        class AssignedEvents extends ClusterBehavior.Events {
            declare happened: Observable<[payload: { level: number }]>;

            constructor() {
                super();
                this.happened = Observable();
            }
        }

        class AssignedServer extends ClusterBehavior {
            declare events: AssignedEvents;

            static override readonly schema = new ClusterModel({
                name: "Assigned",
                id: 0xfff1fc0c,
                children: [new EventModel({ name: "Happened", id: 0, priority: "info" })],
            });

            static override readonly Events = AssignedEvents;
        }

        await using endpoint = await MockEndpoint.create(MockEndpointType.with(AssignedServer));

        await endpoint.act(agent => {
            agent.get(AssignedServer).events.happened.emit({ level: 1 });
        });

        const recorded = new Array<number>();
        for await (const occurrence of endpoint.env.get(OccurrenceManager).get()) {
            if (occurrence.clusterId === 0xfff1fc0c) {
                recorded.push(occurrence.eventId);
            }
        }
        expect(recorded).deep.equals([0]);
    });

    it("keeps the internal stateChanged observable of a standard cluster with a StateChanged event", async () => {
        await using endpoint = await MockEndpoint.create(MockEndpointType.with(ActionsServer));

        expect(endpoint.eventsOf(ActionsServer).stateChanged).not.instanceOf(OnlineEvent);
    });

    it("refuses a State assigned after the schema resolved", async () => {
        class EarlyServer extends OnOffServer {
            static readonly resolvedId = this.cluster.id;
        }

        class LateState extends OnOffServer.State {
            @attribute(VENDOR_ATTRIBUTE_ID, uint32)
            vendorCounter = 0;
        }
        Reflect.set(EarlyServer, "State", LateState);

        await expect(MockEndpoint.create(MockEndpointType.with(EarlyServer))).rejectedWith("schema does not include");
    });

    it("refuses Events assigned after the schema resolved", async () => {
        class EarlyEventsServer extends OnOffServer {
            static readonly resolvedId = this.cluster.id;
        }

        class LateEvents extends OnOffServer.Events {
            @event(VENDOR_ATTRIBUTE_ID, EventfulPayload)
            vendorHappened = Observable<[payload: EventfulPayload]>();
        }
        Reflect.set(EarlyEventsServer, "Events", LateEvents);

        await expect(MockEndpoint.create(MockEndpointType.with(EarlyEventsServer))).rejectedWith(
            "uses the Events of EarlyEventsServer",
        );
    });

    it("names the class whose State was assigned late when a subclass inherits it", async () => {
        class LateParentServer extends OnOffServer {
            static readonly resolvedId = this.cluster.id;
        }
        class InheritingServer extends LateParentServer {}
        Schema(InheritingServer);

        class LateState extends OnOffServer.State {
            @attribute(VENDOR_ATTRIBUTE_ID, uint32)
            vendorCounter = 0;
        }
        Reflect.set(LateParentServer, "State", LateState);

        await expect(MockEndpoint.create(MockEndpointType.with(InheritingServer))).rejectedWith(
            "uses the State of LateParentServer",
        );
    });

    it("refuses a variant built before the State of its base was assigned", async () => {
        class EarlyBaseServer extends OnOffServer {
            static readonly Variant = this.with("Lighting");
        }

        class LateState extends OnOffServer.State {
            @attribute(VENDOR_ATTRIBUTE_ID, uint32)
            vendorCounter = 0;
        }
        Reflect.set(EarlyBaseServer, "State", LateState);

        await expect(MockEndpoint.create(MockEndpointType.with(EarlyBaseServer.Variant))).rejectedWith(
            "uses the State of EarlyBaseServer",
        );
    });
});
