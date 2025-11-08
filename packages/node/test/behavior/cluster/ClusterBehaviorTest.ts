/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { StateType } from "#behavior/state/StateType.js";
import { BasicInformationBehavior } from "#behaviors/basic-information";
import { LevelControlServer } from "#behaviors/level-control";
import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffServer } from "#behaviors/on-off";
import {
    AsyncObservable,
    BasicObservable,
    EventEmitter,
    ImplementationError,
    MaybePromise,
    Observable,
} from "#general";
import { AttributeElement, ClusterModel } from "#model";
import {
    Attribute,
    ClusterId,
    ClusterType,
    ClusterTypeModifier,
    TlvBoolean,
    TlvInt32,
    TlvNullable,
    TlvString,
} from "#types";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { My, MyBehavior, MyCluster } from "./cluster-behavior-test-util.js";

class MyEventedBehavior extends MyBehavior {
    declare events: MyEventedBehavior.Events;
}

namespace MyEventedBehavior {
    export class Events extends MyBehavior.Events {
        somethingHappened = Observable<[]>();
    }
}

class BehaviorWithCustomMethods extends MyBehavior.with("Awesome") {
    foo() {
        return true;
    }

    bar() {
        return 4;
    }
}

namespace BehaviorWithCustomMethods {
    export declare const ExtensionInterface: {
        bar(): number;
    };
}

describe("ClusterBehavior", () => {
    type Match<Input, Type> = Input extends Type ? true : false;

    describe("base class", () => {
        describe("state types meet type requirement", () => {
            ClusterBehavior.State satisfies StateType;
            ClusterBehavior.State satisfies ClusterBehavior.Type["State"];
        });

        describe("meets type requirements", () => {
            ClusterBehavior satisfies Behavior.Type;

            ({}) as ClusterBehavior["state"] satisfies InstanceType<ClusterBehavior.Type>["state"];
            ({}) as ClusterBehavior["events"] satisfies InstanceType<ClusterBehavior.Type>["events"];

            ClusterBehavior.State satisfies ClusterBehavior.Type["State"];
            ClusterBehavior.Events satisfies ClusterBehavior.Type["Events"];

            typeof ClusterBehavior.State === "function";
            typeof ClusterBehavior.Events === "function";

            ClusterBehavior satisfies ClusterBehavior.Type;
            typeof ClusterBehavior === "function";
        });
    });

    describe("for", () => {
        it("exposes mandatory properties for enabled cluster elements", () => {
            MyBehavior satisfies { id: "myCluster" };

            ({}) as MyBehavior satisfies {
                state: {
                    reqAttr: string;
                };
            };
            expect(new MyBehavior.State().reqAttr).equals("hello");

            ({}) as MyBehavior satisfies {
                reqCmd: (request: string, state: any) => MaybePromise<string>;
                becomeAwesome?: undefined;
            };
            expect(typeof MyBehavior.prototype.reqCmd).equals("function");

            ({}) as MyBehavior satisfies {
                events: EventEmitter & {
                    reqAttr$Changed: AsyncObservable<[value: string, oldValue: string, context: ActionContext]>;
                };
            };

            ({}) as MyBehavior satisfies {
                events: {
                    reqEv: Observable<[string, context?: ActionContext]>;
                };
            };
        });

        it("maintains ID after second for", () => {
            const ForBehavior = MyBehavior.for(MyCluster);
            ForBehavior.id satisfies "myCluster";
        });

        it("exposes optional properties for disabled cluster elements", () => {
            undefined satisfies MyBehavior["state"]["optAttr"];
            true satisfies MyBehavior["state"]["optAttr"];
            (() => true) satisfies MyBehavior["optCmd"];
            ((..._args: any[]) => true) satisfies MyBehavior["optCmd"];
            ({}) as Match<MyBehavior["events"], { optAttr$Changed: {} }> satisfies false;
            ({}) as Match<MyBehavior["events"], { optEv: {} }> satisfies false;
            ({}) as Match<MyBehavior, { optCmd: (...args: any[]) => any }> satisfies true;
        });

        it("instance exposes values for enabled cluster elements", async () => {
            const endpoint = await MockEndpoint.createWith(MyBehavior);
            await endpoint.act(agent => {
                const behavior = agent.myCluster;
                expect(behavior.state.reqAttr).equals("hello");
                expect(behavior.requireAttributeEnabled("reqAttr")).equals("hello");
                expect(behavior.assertAttributeEnabled("reqAttr")).is.undefined;
                expect(behavior.reqCmd).is.a("function");
                expect(behavior.events.reqAttr$Changed).instanceof(BasicObservable);
                expect(behavior.events.reqEv).instanceof(BasicObservable);
                expect(behavior.state.condAttr).is.undefined;
                expect(behavior.state.condOptAttr1).is.undefined;
                expect(behavior.state.condOptAttr2).is.undefined;
                expect(behavior.events.condAttr$Changed).instanceof(BasicObservable);
                expect(behavior.events.condOptAttr1$Changed).instanceof(BasicObservable);
                expect(behavior.events.condOptAttr2$Changed).instanceof(BasicObservable);
            });
        });

        it("instance does not expose values for disabled cluster elements", async () => {
            const endpoint = await MockEndpoint.createWith(MyBehavior);
            await endpoint.act(agent => {
                const behavior = agent.myCluster;
                expect(behavior.state.optAttr).undefined;
                let errorCount = 0;
                try {
                    behavior.requireAttributeEnabled("optAttr");
                } catch (error) {
                    expect(error).instanceof(ImplementationError);
                    expect((error as ImplementationError).message).equals(
                        "To use this feature, please enable attribute optAttr by setting the value during initialization",
                    );
                    errorCount++;
                }
                try {
                    behavior.assertAttributeEnabled("optAttr");
                } catch (error) {
                    expect(error).instanceof(ImplementationError);
                    expect((error as ImplementationError).message).equals(
                        "To use this feature, please enable attribute optAttr by setting the value during initialization",
                    );
                    errorCount++;
                }
                expect(errorCount).equals(2);

                // The "changed" event should be present even if the attribute is not enabled
                expect(behavior.events.optAttr$Changed).not.undefined;

                expect(behavior.events.optEv).undefined;
            });
        });

        it("instance allows standard method override", () => {
            const Ignored = class extends MyBehavior {
                override reqCmd(request: string): string {
                    return request.toUpperCase();
                }

                override optCmd(request: boolean): boolean {
                    return !request;
                }
            };
            Ignored;
        });

        it("assigns correct default values", () => {
            const MyBehavior = ClusterBehavior.for(
                ClusterType({
                    name: "MyCluster",
                    id: ClusterId(1),
                    revision: 1,
                    attributes: {
                        attr1: Attribute(1, TlvNullable(TlvInt32)),
                        attr2: Attribute(2, TlvInt32, { default: 123 }),
                        attr3: Attribute(3, TlvString, { default: "abc" }),
                        attr4: Attribute(4, TlvBoolean),
                    },
                }),
                new ClusterModel({
                    name: "MyCluster",
                    id: 1,
                    children: [
                        AttributeElement({ id: 1, name: "Attr1", type: "int32", quality: "X", conformance: "M" }),
                        AttributeElement({ id: 2, name: "Attr2", type: "int32", default: 123, conformance: "M" }),
                        AttributeElement({ id: 3, name: "Attr3", type: "string", default: "abc", conformance: "M" }),
                        AttributeElement({ id: 4, name: "Attr4", type: "bool", conformance: "M" }),
                    ],
                }),
            );

            expect(MyBehavior.defaults.attr1).equals(null);
            expect(MyBehavior.defaults.attr2).equals(123);
            expect(MyBehavior.defaults.attr3).equals("abc");
            expect(MyBehavior.defaults.attr4).equals(false);
        });

        it("carries forward non-command methods", () => {
            ({}) as BehaviorWithCustomMethods satisfies { foo(): boolean };

            const WithRevertedFeature = BehaviorWithCustomMethods.for(MyCluster);

            ({}) as InstanceType<typeof WithRevertedFeature> satisfies { foo(): boolean };

            class FooOverrideBehavior extends WithRevertedFeature {
                // Note -- limitation due to https://github.com/microsoft/TypeScript/issues/27965 requires us to
                // override as an instance function rather than a method
                override foo = () => {
                    return false;
                };

                // This is in ExtensionInterface so TS bug above does not apply
                override bar() {
                    return 5;
                }
            }

            ({}) as InstanceType<typeof FooOverrideBehavior> satisfies { foo(): boolean };
        });
    });

    describe("set", () => {
        it("recreates type", () => {
            const SetBehavior = MyBehavior.set({});
            SetBehavior.id satisfies "myCluster";
            expect(SetBehavior.id).equals("myCluster");
        });
    });

    describe("alter", () => {
        it("recreates ID", () => {
            // Test constituent parts
            MyCluster.name satisfies "MyCluster";

            const AlteredCluster = new ClusterTypeModifier(MyCluster).alter({});
            AlteredCluster.name satisfies "MyCluster";

            const BehaviorForAlteredCluster = MyBehavior.for(AlteredCluster);
            BehaviorForAlteredCluster.id satisfies "myCluster";

            // Now test all together
            const AlteredBehavior = MyBehavior.alter({});
            AlteredBehavior.id satisfies "myCluster";
            expect(AlteredBehavior.id).equals("myCluster");
        });

        it("extends correct event class", () => {
            const base = new MyEventedBehavior.Events();
            expect(typeof base.somethingHappened?.on).equals("function");

            const Altered = MyEventedBehavior.alter({});
            const altered = new Altered.Events();
            expect(typeof altered.somethingHappened?.on).equals("function");
        });
    });

    describe("with", () => {
        it("is satisfactory", () => {
            const AwesomeBehavior = MyBehavior.with("Awesome");

            ({}) as InstanceType<typeof AwesomeBehavior.Events> satisfies EventEmitter;
            (({}) as InstanceType<typeof AwesomeBehavior>).events satisfies EventEmitter;

            AwesomeBehavior satisfies ClusterBehavior.Type;
        });

        it("recreates ID", () => {
            const AwesomeBehavior = MyBehavior.with("Awesome");
            AwesomeBehavior.id satisfies "myCluster";
            expect(AwesomeBehavior.id).equals("myCluster");
        });

        it("adds feature elements", () => {
            const AwesomeBehavior = MyBehavior.with(My.Feature.Awesome);

            ({}) as InstanceType<typeof AwesomeBehavior> satisfies {
                state: {
                    awesomeSauce: number;
                };

                becomeAwesome(value: number): void;

                events: EventEmitter & {
                    becameAwesome: Observable<[number, ActionContext]>;
                };
            };

            expect(AwesomeBehavior.cluster.supportedFeatures).deep.equals({ awesome: true });
            expect(AwesomeBehavior.schema.supportedFeatures).deep.equals(new Set(["AWE"]));
        });

        it("allows extension and base command overrides", () => {
            const AwesomeBehavior = MyBehavior.with(My.Feature.Awesome);
            class AwesomeServer extends AwesomeBehavior {
                override reqCmd(): string {
                    return "hi";
                }

                override becomeAwesome(_value: number) {}
            }
            AwesomeServer;
        });

        it("adds feature elements on NetworkCommissioningServer", () => {
            const EthernetCommissioningServer = NetworkCommissioningServer.with("EthernetNetworkInterface");

            expect(EthernetCommissioningServer.cluster.supportedFeatures.ethernetNetworkInterface).true;
            expect(EthernetCommissioningServer.cluster.supportedFeatures.wiFiNetworkInterface).false;
            expect(EthernetCommissioningServer.cluster.supportedFeatures.threadNetworkInterface).false;
        });
    });

    describe("enable", () => {
        it("enables events", () => {
            const MyBi = BasicInformationBehavior.enable({ events: { startUp: true } });
            ({}) as InstanceType<typeof MyBi> satisfies ClusterBehavior;
            (({}) as InstanceType<typeof MyBi>).events satisfies EventEmitter;

            const Events2 = MyBi.Events;
            ({}) as InstanceType<typeof Events2> satisfies EventEmitter;

            const eventsInstance = new Events2();
            void (eventsInstance.startUp satisfies Observable);
            expect(eventsInstance.startUp).not.undefined;
        });

        it("sets defaults for newly-enabled properties", () => {
            const MyOnOffServer = OnOffServer.with("Lighting").enable({ attributes: { onTime: true } });
            expect(new MyOnOffServer.State().onTime).equals(0);

            const MyLevelControl2 = LevelControlServer.with("Lighting");
            expect(new MyLevelControl2.State().remainingTime).equals(0);
        });
    });

    describe("defaults", () => {});
});
