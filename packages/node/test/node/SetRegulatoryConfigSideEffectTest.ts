/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { FAILSAFE_LENGTH_S, MockServerNode } from "@matter/node/testing";

const IndoorOnlyCommissioning = GeneralCommissioningServer.set({
    locationCapability: GeneralCommissioning.RegulatoryLocationType.Indoor,
});

describe("SetRegulatoryConfig side effects", () => {
    it("does not write BasicInformation.location when newRegulatoryConfig validation fails", async () => {
        const node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(IndoorOnlyCommissioning),
        });

        const contextOptions = { command: true } as const;

        await node.online(contextOptions, async agent => {
            await agent.generalCommissioning.armFailSafe({
                expiryLengthSeconds: FAILSAFE_LENGTH_S,
                breadcrumb: 1,
            });
        });

        const locationBefore = await node.online(
            contextOptions,
            async agent => agent.get(BasicInformationServer).state.location,
        );

        // Outdoor is invalid for an Indoor-only capability, so validation must reject.  countryCode differs from the
        // default to exercise the location write path.
        const result = await node.online(contextOptions, async agent =>
            agent.generalCommissioning.setRegulatoryConfig({
                newRegulatoryConfig: GeneralCommissioning.RegulatoryLocationType.Outdoor,
                countryCode: "DE",
                breadcrumb: 2,
            }),
        );

        expect(result.errorCode).equals(GeneralCommissioning.CommissioningError.ValueOutsideRange);

        const locationAfter = await node.online(
            contextOptions,
            async agent => agent.get(BasicInformationServer).state.location,
        );

        expect(locationAfter).equals(locationBefore);

        await node.close();
    });
});
