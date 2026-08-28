/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerBehavior } from "#node/client/PeerBehavior.js";
import { AttributeId, ClusterId, CommandId } from "@matter/types";

// NetworkCommissioning (0x31) with the EthernetNetworkInterface feature (bit 2).
const NETWORK_COMMISSIONING = ClusterId(0x31);
const ETHERNET_FEATURE = 4;

// Vendor prefix 0xFFF1 with a suffix outside the manufacturer-specific range 0xFC00 - 0xFFFE
const MALFORMED_MEI = ClusterId(0xfff10001, false);

const UNKNOWN_CLUSTER = ClusterId(0xfff1fc01);

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
    });
});
