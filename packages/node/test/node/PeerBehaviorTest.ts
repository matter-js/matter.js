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

describe("PeerBehavior", () => {
    describe("discovered schema generation", () => {
        it("builds a cluster even when the peer reports an empty AttributeList", () => {
            // Some device firmware returns an empty AttributeList (0xFFFB) despite serving attribute data.  Pre-fix
            // this marked every standard attribute — including mandatory globals such as FeatureMap — as unsupported,
            // producing a duplicate definition that broke schema generation (home-assistant/addons#4673).
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
    });
});
