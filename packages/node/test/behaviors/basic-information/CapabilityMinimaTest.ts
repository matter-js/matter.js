/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { MockServerNode } from "@matter/node/testing";

function capabilityMinima(node: MockServerNode) {
    return node.stateOf(BasicInformationServer).capabilityMinima;
}

describe("CapabilityMinima", () => {
    it("seeds the four 1.6 fields with the advertised defaults", async () => {
        const node = await MockServerNode.createOnline();
        const cm = capabilityMinima(node);

        expect(cm.readPathsSupported).equals(20);
        expect(cm.subscribePathsSupported).equals(20);
        expect(cm.simultaneousInvocationsSupported).equals(20);
        expect(cm.simultaneousWritesSupported).equals(20);
    });

    it("preserves caller-provided values over the derived defaults", async () => {
        const node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint,
            basicInformation: {
                capabilityMinima: {
                    caseSessionsPerFabric: 3,
                    subscriptionsPerFabric: 3,
                    readPathsSupported: 12,
                    subscribePathsSupported: 5,
                },
            },
        });
        const cm = capabilityMinima(node);

        expect(cm.readPathsSupported).equals(12);
        expect(cm.subscribePathsSupported).equals(5);
        expect(cm.simultaneousInvocationsSupported).equals(20);
        expect(cm.simultaneousWritesSupported).equals(20);
    });
});
