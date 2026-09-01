/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommodityTariffServer } from "#behaviors/commodity-tariff";
import { CommodityTariff } from "@matter/types/clusters/commodity-tariff";
import { MockServerNode } from "../../node/mock-server-node.js";

const NullState = {
    tariffInfo: null,
    tariffUnit: null,
    startDate: null,
    dayEntries: null,
    dayPatterns: null,
    calendarPeriods: null,
    individualDays: null,
    tariffComponents: null,
    tariffPeriods: null,
    currentDay: null,
    nextDay: null,
    currentDayEntry: null,
    currentDayEntryDate: null,
    nextDayEntry: null,
    nextDayEntryDate: null,
    currentTariffComponents: null,
    nextTariffComponents: null,
};

/**
 * DayEntryStruct's RandomizationType is optional under conformance "[RNDM]" and carries a schema fallback, so a day
 * entry that omits it must be stored as written in either feature state.
 */
describe("CommodityTariffServer", () => {
    it("stores a day entry that omits the randomization fields", async () => {
        await using node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(
                CommodityTariffServer.with(CommodityTariff.Feature.Pricing).set(NullState),
            ),
        });

        await node.setStateOf(CommodityTariffServer, { dayEntries: [{ dayEntryId: 1, startTime: 0 }] });

        const [dayEntry] = node.stateOf(CommodityTariffServer).dayEntries!;
        expect(dayEntry.dayEntryId).equals(1);
        expect(dayEntry.randomizationType).equals(undefined);
    });

    it("stores a day entry that omits the randomization fields with Randomization supported", async () => {
        await using node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(
                CommodityTariffServer.with(CommodityTariff.Feature.Pricing, CommodityTariff.Feature.Randomization).set({
                    ...NullState,
                    defaultRandomizationOffset: null,
                    defaultRandomizationType: null,
                }),
            ),
        });

        await node.setStateOf(CommodityTariffServer, { dayEntries: [{ dayEntryId: 1, startTime: 0 }] });

        // Absence is meaningful: it selects the cluster's DefaultRandomizationType, which the fallback would override
        const [dayEntry] = node.stateOf(CommodityTariffServer).dayEntries!;
        expect(dayEntry.dayEntryId).equals(1);
        expect(dayEntry.randomizationType).equals(undefined);
    });
});
