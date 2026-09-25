/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
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
});
