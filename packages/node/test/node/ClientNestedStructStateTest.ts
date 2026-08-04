/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommodityTariffClient, CommodityTariffServer } from "#behaviors/commodity-tariff";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

const TARIFF_INFO = {
    tariffLabel: "Off-peak / peak",
    providerName: "Utility",
    currency: { currency: 978, decimalPoints: 4 },
    blockMode: 0,
};

describe("client state for nested structs", () => {
    before(() => {
        MockTime.init();
    });

    it("retains a struct-valued field of a struct attribute", async () => {
        const TariffWithCurrency = CommodityTariffServer.with("Pricing").set({ tariffInfo: TARIFF_INFO });

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(TariffWithCurrency),
            },
        });

        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;

        const { tariffInfo } = ep1.stateOf(CommodityTariffClient);
        expect(tariffInfo).not.undefined;
        expect(tariffInfo!.tariffLabel).equals(TARIFF_INFO.tariffLabel);
        expect(tariffInfo!.blockMode).equals(TARIFF_INFO.blockMode);
        expect(tariffInfo!.currency?.currency).equals(TARIFF_INFO.currency.currency);
        expect(tariffInfo!.currency?.decimalPoints).equals(TARIFF_INFO.currency.decimalPoints);
    });
});
