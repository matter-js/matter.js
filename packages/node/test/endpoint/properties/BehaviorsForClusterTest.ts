/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { OnOffClient } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ClusterId } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

describe("Behaviors#forCluster", () => {
    it("returns the client behavior type registered for a supported cluster", () => {
        const endpoint = new Endpoint(OnOffLightDevice.withBehaviors(OnOffClient));
        expect(endpoint.behaviors.forCluster(OnOff.Cluster.id)).equal(OnOffClient);
    });

    it("returns the server behavior type registered for a supported cluster", () => {
        const endpoint = new Endpoint(OnOffLightDevice);
        const type = endpoint.behaviors.forCluster(OnOff.Cluster.id);
        expect(type).not.undefined;
        expect(ClusterBehavior.is(type!)).equal(true);
        expect(type!.id).equal("onOff");
    });

    it("returns undefined for a cluster the endpoint does not support", () => {
        const endpoint = new Endpoint(OnOffLightDevice.withBehaviors(OnOffClient));
        expect(endpoint.behaviors.forCluster(ClusterId(0xffff, false))).undefined;
    });

    it("ignores supported non-cluster behaviors", () => {
        class PlainBehavior extends Behavior {
            static override readonly id = "plain";
        }
        const endpoint = new Endpoint(OnOffLightDevice);
        endpoint.behaviors.inject(PlainBehavior);
        expect(endpoint.behaviors.forCluster(ClusterId(0xffff, false))).undefined;
    });
});
