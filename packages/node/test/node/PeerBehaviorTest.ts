/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { OnOffBehavior } from "#behaviors/on-off";
import { PeerBehavior } from "#node/client/PeerBehavior.js";
import { AttributeModel, ClusterModel, DataModelPath, FeatureMap, Matter } from "@matter/model";
import { ConformanceError } from "@matter/protocol";
import { AttributeId, ClusterId, CommandId } from "@matter/types";

// NetworkCommissioning (0x31) with the EthernetNetworkInterface feature (bit 2).
const NETWORK_COMMISSIONING = ClusterId(0x31);
const ETHERNET_FEATURE = 4;

// Vendor prefix 0xFFF1 with a suffix outside the manufacturer-specific range 0xFC00 - 0xFFFE
const MALFORMED_MEI = ClusterId(0xfff10001, false);

const UNKNOWN_CLUSTER = ClusterId(0xfff1fc01);

const LEVEL_CONTROL = ClusterId(0x8);

// AlarmMask (0x22) is deprecated ("D") in Pump Configuration and Control
const PUMP_CONFIGURATION_AND_CONTROL = ClusterId(0x200);
const PUMP_ALARM_MASK = AttributeId(0x22);
const PUMP_MANDATORY_ATTRIBUTES = [0x0, 0x1, 0x2, 0x11, 0x12, 0x20, 0x21, 65528, 65529, 65531, 65532, 65533].map(n =>
    AttributeId(n),
);

// UltrasonicOccupiedToUnoccupiedDelay (0x20) is "[HoldTime & US], D": disallowed for a sensor without the Ultrasonic
// feature, as the "D" only announces a future deprecation
const OCCUPANCY_SENSING = ClusterId(0x406);
const OCCUPANCY_PIR_FEATURE = 2;
const OCCUPANCY_ULTRASONIC_DELAY = AttributeId(0x20);
const OCCUPANCY_MANDATORY_ATTRIBUTES = [0x0, 0x1, 0x2, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n));

// RemainingTime (0x1) is mandatory with the Lighting feature (bit 1)
const LEVEL_CONTROL_LIGHTING_FEATURE = 2;
const LEVEL_CONTROL_REMAINING_TIME = AttributeId(0x1);

// OnMode (0x3) is disallowed ("X") in RVC Clean Mode
const RVC_CLEAN_MODE = ClusterId(0x55);
const RVC_CLEAN_MODE_ON_MODE = AttributeId(0x3);
const RVC_CLEAN_MODE_MANDATORY_ATTRIBUTES = [0x0, 0x1, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n));

// A custom cluster at revision 3 with one attribute the specification would only introduce at that revision
const REV_GATED = ClusterId(0xfff1fc02);
const REV_GATED_MODEL = Matter.withClusters(
    new ClusterModel({
        id: REV_GATED,
        name: "RevGated",
        children: [
            FeatureMap.clone(),
            new AttributeModel({ id: 0xfffd, name: "ClusterRevision", type: "uint16", default: 3 }),
            new AttributeModel({ id: 1, name: "Gated", type: "uint8", conformance: "[Rev >= v3]" }),
        ],
    }),
);

// A custom cluster with one obsolete ("Z") attribute
const OBSOLETE = ClusterId(0xfff1fc03);
const OBSOLETE_MODEL = Matter.withClusters(
    new ClusterModel({
        id: OBSOLETE,
        name: "WithObsolete",
        children: [
            FeatureMap.clone(),
            new AttributeModel({ id: 0xfffd, name: "ClusterRevision", type: "uint16", default: 1 }),
            new AttributeModel({ id: 1, name: "Retired", type: "uint8", conformance: "Z" }),
        ],
    }),
);

describe("PeerBehavior", () => {
    describe("discovered schema generation", () => {
        it("builds a cluster even when the peer reports an empty AttributeList", () => {
            // Some device firmware returns an empty AttributeList (0xFFFB) despite serving attribute data.  The
            // standard attributes, including mandatory globals such as FeatureMap, must remain supported; marking
            // them unsupported produces a duplicate definition that breaks schema generation.
            const shape: PeerBehavior.DiscoveredClusterShape = {
                kind: "discovered",
                id: NETWORK_COMMISSIONING,
                revision: 1,
                features: ETHERNET_FEATURE,
                attributes: [] as AttributeId[],
                generatedCommands: [] as CommandId[],
            };

            const behaviorType = PeerBehavior(shape);

            expect(behaviorType).not.undefined;
            expect(behaviorType.cluster.attributes?.interfaceEnabled).not.undefined;
        });

        it("builds a cluster from a well-formed AttributeList", () => {
            // Differentiate the cache fingerprint from the empty-list case above via a distinct attribute set.
            const shape: PeerBehavior.DiscoveredClusterShape = {
                kind: "discovered",
                id: NETWORK_COMMISSIONING,
                revision: 1,
                features: ETHERNET_FEATURE,
                attributes: [4, 65528, 65529, 65530, 65531, 65532, 65533].map(n => AttributeId(n)),
                commands: [] as CommandId[],
            };

            const behaviorType = PeerBehavior(shape);

            expect(behaviorType).not.undefined;
            expect(behaviorType.cluster.attributes?.interfaceEnabled).not.undefined;
        });

        it("builds a cluster for an ID that is not a legal MEI", () => {
            const shape: PeerBehavior.DiscoveredClusterShape = {
                kind: "discovered",
                id: MALFORMED_MEI,
                revision: 1,
                attributes: [65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
            };

            const behaviorType = PeerBehavior(shape);

            expect(behaviorType.cluster.id).equals(MALFORMED_MEI);
        });

        it("builds a cluster for an ID a custom model resolves but the specification does not allow", () => {
            const matter = Matter.withClusters(new ClusterModel({ id: MALFORMED_MEI, name: "CustomIllegalMei" }));

            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: MALFORMED_MEI,
                revision: 1,
                attributes: [65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
                matter,
            });

            expect(behaviorType.cluster.id).equals(MALFORMED_MEI);
        });

        it("distinguishes shapes whose attribute IDs differ by the block size", () => {
            const shapeFor = (attr: number): PeerBehavior.DiscoveredClusterShape => ({
                kind: "discovered",
                id: UNKNOWN_CLUSTER,
                revision: 1,
                attributes: [AttributeId(attr)],
                commands: new Array<CommandId>(),
            });

            const first = PeerBehavior(shapeFor(1));
            const second = PeerBehavior(shapeFor(33));

            expect(first).not.equals(second);
            expect(Object.keys(first.cluster.attributes ?? {})).deep.equals(["attr$1"]);
            expect(Object.keys(second.cluster.attributes ?? {})).deep.equals(["attr$21"]);
        });

        it("reports the revision the peer sent", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: LEVEL_CONTROL,
                revision: 5,
                attributes: [0, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
            });

            expect(behaviorType.cluster.revision).equals(5);
        });

        it("judges a revision-conformant element against the revision the peer sent", () => {
            const validateFor = (revision: number) => {
                const { schema } = PeerBehavior({
                    kind: "discovered",
                    id: REV_GATED,
                    revision,
                    attributes: [0xfffc, 0xfffd].map(n => AttributeId(n)),
                    commands: new Array<CommandId>(),
                    matter: REV_GATED_MODEL,
                });
                const supervisor = RootSupervisor.for(schema).get(schema);
                return () =>
                    supervisor.validate?.({ gated: 1 }, LocalActorContext.ReadOnly, {
                        path: new DataModelPath("RevGated"),
                    });
            };

            expect(validateFor(3)).not.throw();
            expect(validateFor(2)).throw(ConformanceError);
        });

        it("leaves a revision-conformant element to the peer on a write from a client node", () => {
            const { schema } = PeerBehavior({
                kind: "discovered",
                id: REV_GATED,
                revision: 2,
                attributes: [0xfffc, 0xfffd].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
                matter: REV_GATED_MODEL,
            });
            const supervisor = RootSupervisor.for(schema).get(schema);
            const session = { ...LocalActorContext.ReadOnly, clientPeerContext: {} };

            expect(() =>
                supervisor.validate?.({ gated: 1 }, session, { path: new DataModelPath("RevGated") }),
            ).not.throw();
        });

        it("reports a revision the standard cluster does not yet define", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: REV_GATED,
                revision: 4,
                attributes: [0xfffc, 0xfffd].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
                matter: REV_GATED_MODEL,
            });

            expect(behaviorType.cluster.revision).equals(4);
        });

        it("reports the revision an unknown cluster sent", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: UNKNOWN_CLUSTER,
                revision: 4,
                attributes: [AttributeId(3)],
                commands: new Array<CommandId>(),
            });

            expect(behaviorType.cluster.revision).equals(4);
        });

        it("distinguishes shapes that differ only in revision", () => {
            const shapeFor = (revision: number): PeerBehavior.DiscoveredClusterShape => ({
                kind: "discovered",
                id: UNKNOWN_CLUSTER,
                revision,
                attributes: [AttributeId(1)],
                commands: new Array<CommandId>(),
            });

            expect(PeerBehavior(shapeFor(2))).not.equals(PeerBehavior(shapeFor(3)));
        });

        it("shares a behavior with a peer that reports the standard revision", () => {
            const shapeFor = (revision?: number): PeerBehavior.DiscoveredClusterShape => ({
                kind: "discovered",
                id: REV_GATED,
                revision,
                attributes: [0xfffc, 0xfffd].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
                matter: REV_GATED_MODEL,
            });

            expect(PeerBehavior(shapeFor(3))).equals(PeerBehavior(shapeFor()));
        });

        it("exposes a deprecated attribute the peer reports", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: PUMP_CONFIGURATION_AND_CONTROL,
                revision: 5,
                attributes: [...PUMP_MANDATORY_ATTRIBUTES, PUMP_ALARM_MASK],
                commands: new Array<CommandId>(),
            });

            expect(new behaviorType.State()).has.property("alarmMask");
            expect(new behaviorType.Events()).has.property("alarmMask$Changed");
        });

        it("omits an attribute the peer reports whose conformance before a trailing deprecation excludes it", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: OCCUPANCY_SENSING,
                revision: 5,
                features: OCCUPANCY_PIR_FEATURE,
                attributes: [...OCCUPANCY_MANDATORY_ATTRIBUTES, OCCUPANCY_ULTRASONIC_DELAY],
                commands: new Array<CommandId>(),
            });

            expect(new behaviorType.State()).not.has.property("ultrasonicOccupiedToUnoccupiedDelay");
        });

        it("keeps the conformance of a reported attribute that the peer's features make mandatory", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: LEVEL_CONTROL,
                features: LEVEL_CONTROL_LIGHTING_FEATURE,
                attributes: [0x0, 0x1, 0xf, 0x11, 65528, 65529, 65531, 65532, 65533].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
            });

            const { schema } = behaviorType;
            if (!(schema instanceof ClusterModel)) {
                expect.fail("Peer behavior has no cluster schema");
            }
            expect(schema.attributes(LEVEL_CONTROL_REMAINING_TIME)?.effectiveConformance.toString()).equals("LT");
        });

        it("exposes an obsolete attribute the peer reports", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: OBSOLETE,
                revision: 1,
                attributes: [0x1, 0xfffc, 0xfffd].map(n => AttributeId(n)),
                commands: new Array<CommandId>(),
                matter: OBSOLETE_MODEL,
            });

            expect(new behaviorType.State()).has.property("retired");
        });

        it("omits a deprecated attribute the peer does not report", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: PUMP_CONFIGURATION_AND_CONTROL,
                revision: 5,
                attributes: PUMP_MANDATORY_ATTRIBUTES,
                commands: new Array<CommandId>(),
            });

            expect(new behaviorType.State()).not.has.property("alarmMask");
        });

        it("omits a disallowed attribute the peer reports", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: RVC_CLEAN_MODE,
                attributes: [...RVC_CLEAN_MODE_MANDATORY_ATTRIBUTES, RVC_CLEAN_MODE_ON_MODE],
                commands: new Array<CommandId>(),
            });

            expect(new behaviorType.State()).not.has.property("onMode");
        });

        it("tolerates a peer that does not report a revision", () => {
            const behaviorType = PeerBehavior({
                kind: "discovered",
                id: UNKNOWN_CLUSTER,
                attributes: [AttributeId(2)],
                commands: new Array<CommandId>(),
            });

            expect(behaviorType.cluster.revision).equals(1);
        });
    });

    describe("known shape", () => {
        it("returns a peer behavior as it is", () => {
            const peerType = PeerBehavior({ kind: "known", behavior: OnOffBehavior });
            expect(peerType).not.equals(OnOffBehavior);

            expect(PeerBehavior({ kind: "known", behavior: peerType })).equals(peerType);
        });
    });
});
