/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterOf } from "#behavior/cluster/cluster-behavior-utils.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterEvents } from "#behavior/cluster/ClusterEvents.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { OnlineEvent } from "#behavior/Events.js";
import { BasicInformationBehavior, BasicInformationServer } from "#behaviors/basic-information";
import { BasicInformation } from "#clusters/basic-information";
import { EventEmitter, MaybePromise, Observable } from "#general";
import { ClusterType } from "#types";
import { MyCluster, MySchema } from "./cluster-behavior-test-util.js";

const MyClusterWithOptEvent = MyCluster.enable({ events: { optEv: true } });
type MyClusterWithOptEvent = typeof MyClusterWithOptEvent;
const MyClusterBehavior = ClusterBehavior.for(MyCluster, MySchema);
const MyClusterWithOptEventBehavior = MyClusterBehavior.for(MyClusterWithOptEvent);
const BiWithStartup = BasicInformation.Cluster.enable({ events: { startUp: true } });
type BiWithStartup = typeof BiWithStartup;

describe("ClusterEvents", () => {
    describe("ClusterEvents type", () => {
        type Ep = ClusterEvents<MyCluster, Behavior.Type>;

        it("extends EventEmitter", () => {
            ({}) as Ep satisfies EventEmitter;
        });

        it("extends EventEmitter within ClusterBehavior", () => {
            ({}) as InstanceType<typeof MyClusterBehavior.Events> satisfies EventEmitter;
        });

        it("extends EventEmitter after swapping clusters", () => {
            ({}) as InstanceType<typeof MyClusterWithOptEventBehavior.Events> satisfies EventEmitter;
        });

        it("extends EventEmitter with enabled", () => {
            type Ep2 = ClusterEvents<BiWithStartup, typeof BasicInformationBehavior>;
            ({}) as Ep2 satisfies EventEmitter;
        });

        it("includes required", () => {
            ({}) as Ep satisfies EventEmitter & {
                reqAttr$Changed: Observable<[value: string, oldValue: string, context: ActionContext], MaybePromise>;

                reqEv: Observable<[payload: string, context?: ActionContext]>;
            };
        });

        it("allows optional", () => {
            undefined satisfies Ep["optAttr$Changed"];
            void ({} as OnlineEvent<[boolean, boolean, context: ActionContext]> satisfies Ep["optAttr$Changed"]);
            undefined satisfies Ep["optEv"];
            void ({} as OnlineEvent<[string, context: ActionContext]> satisfies Ep["optEv"]);
        });
    });

    describe("EventsInstance", () => {
        type Ei = ClusterEvents<MyCluster, Behavior.Type>;

        it("extends EventEmitter", () => {
            ({}) as Ei satisfies EventEmitter;
        });

        it("extends EventEmitter with swapped cluster", () => {
            ({}) as InstanceType<typeof MyClusterBehavior.Events> satisfies EventEmitter;

            ({}) as InstanceType<typeof MyClusterBehavior> satisfies { cluster: ClusterType };

            type Cluster = ClusterOf<typeof MyClusterBehavior>;
            ({}) as Cluster satisfies ClusterType;

            type ToOmit = keyof ClusterEvents.Properties<Cluster>;

            type EquivalentToClusterEvents = Omit<InstanceType<typeof MyClusterBehavior.Events>, ToOmit> &
                keyof ClusterEvents.Properties<MyCluster>;
            ({}) as EquivalentToClusterEvents satisfies EventEmitter;

            type Ei = ClusterEvents<MyCluster, typeof MyClusterBehavior>;
            ({}) as Ei satisfies EventEmitter;
        });

        it("extends EventEmitter for real-world cluster with enabled events", () => {
            type Events = ClusterEvents<BiWithStartup, typeof BasicInformationBehavior>;
            ({}) as Events satisfies EventEmitter;
        });

        it("extends EventEmitter for real-world behavior", () => {
            type Events = ClusterEvents<typeof BasicInformationBehavior.cluster, typeof BasicInformationBehavior>;
            ({}) as InstanceType<typeof BasicInformationBehavior.Events> satisfies EventEmitter;
            ({}) as Events satisfies EventEmitter;
        });

        it("extends EventEmitter for real-world server", () => {
            type Events = ClusterEvents<typeof BasicInformationServer.cluster, typeof BasicInformationServer>;
            ({}) as InstanceType<typeof BasicInformationServer.Events> satisfies EventEmitter;
            ({}) as Events satisfies EventEmitter;
        });

        it("requires mandatory", () => {
            ({}) as Ei satisfies {
                reqAttr$Changed: Observable<[value: string, oldValue: string, context: ActionContext], MaybePromise>;

                reqEv: Observable<[payload: string, context: ActionContext]>;
            };
        });

        it("allows optional", () => {
            undefined satisfies Ei["optAttr$Changed"];
            void ({} as OnlineEvent<[boolean, boolean, context: ActionContext]> satisfies Ei["optAttr$Changed"]);
            undefined satisfies Ei["optEv"];
            void ({} as OnlineEvent<[string, context: ActionContext]> satisfies Ei["optEv"]);
        });
    });

    describe("Type", () => {
        it("extends EventEmitter on base behavior", () => {
            type Events = ClusterEvents.Type<MyCluster, typeof ClusterBehavior>;
            (({}) as InstanceType<Events>).addListener;
            ({}) as InstanceType<Events> satisfies EventEmitter;
        });

        it("extends EventEmitter on behavior with swapped cluster", () => {
            type Events = ClusterEvents.Type<MyCluster, typeof MyClusterBehavior>;
            (({}) as InstanceType<Events>).addListener;
            ({}) as InstanceType<Events> satisfies EventEmitter;
        });

        it("extends EventEmitter on behavior with swapped cluster having enabled events", () => {
            type Events = ClusterEvents.Type<MyClusterWithOptEvent, typeof MyClusterBehavior>;
            (({}) as InstanceType<Events>).addListener;
            ({}) as InstanceType<Events> satisfies EventEmitter;
        });

        it("extends EventEmitter on real-world behavior", () => {
            type Events = ClusterEvents.Type<BasicInformation.Cluster, typeof BasicInformationBehavior>;
            ({}) as InstanceType<Events> satisfies EventEmitter;
        });
    });

    describe("Properties", () => {
        it("specifies correct properties with enabled", () => {
            type Props = ClusterEvents.Properties<MyClusterWithOptEvent>;
            ({}) as keyof Props satisfies
                | "reqEv"
                | "optEv"
                | "reqAttr$Changing"
                | "reqAttr$Changed"
                | "optAttr$Changing"
                | "optAttr$Changed"
                | "condAttr$Changing"
                | "condAttr$Changed"
                | "condOptAttr1$Changing"
                | "condOptAttr1$Changed"
                | "condOptAttr2$Changing"
                | "condOptAttr2$Changed";
            "" as "reqEv" | "optEv" | "reqAttr$Changed" | "optAttr$Changed" satisfies keyof Props;
        });

        it("leaves behind EventEmitter when omitted from existing events", () => {
            type Props = ClusterEvents.Properties<MyClusterWithOptEvent>;

            type Events = Omit<InstanceType<typeof MyClusterBehavior.Events>, keyof Props>;
            ({}) as Events satisfies EventEmitter;
        });

        it("leaves behind EventEmitter when omitted from existing events of swapped cluster", () => {
            type Props = ClusterEvents.Properties<MyClusterWithOptEvent>;

            type Events = Omit<InstanceType<typeof MyClusterWithOptEventBehavior.Events>, keyof Props>;
            ({}) as Events satisfies EventEmitter;
        });
    });
});
