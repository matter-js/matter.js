/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommodityTariffServer } from "#behaviors/commodity-tariff";
import { CommodityTariff } from "@matter/types/clusters/commodity-tariff";
import { MockServerNode } from "../../node/mock-server-node.js";

/**
 * Regression test: DayEntryStruct.RandomizationType declares both conformance "[RNDM]" (gated behind the
 * Randomization feature, which this endpoint does not enable — only Pricing is) and a schema default (0).
 * Writing a `dayEntries` list entry that omits RandomizationType used to auto-fill that default and then
 * reject the very same fill for violating the conformance gate it was never asked to violate:
 *
 *   Conformance "[RNDM]": Matter does not allow you to set this attribute
 *
 * A bare (non-list) struct attribute with the identical field shape (e.g. currentDayEntry) did not trip
 * this — the bug was specific to validating list-of-struct entries.
 */
describe("CommodityTariff dayEntries write with a [FEATURE]-gated, defaulted struct field", () => {
    async function createNode() {
        return MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(
                CommodityTariffServer.with(CommodityTariff.Feature.Pricing).set({
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
                }),
            ),
        });
    }

    it("accepts a dayEntries list entry that omits RandomizationType", async () => {
        const node = await createNode();

        // setStateOf() patches via the behavior's supervisor — the same path Matterbridge's setAttribute()
        // helper uses, and where the bug actually lives (a plain `agent.get(...).state.dayEntries = value`
        // assignment goes through a different internal mechanism and does not reproduce it).
        await node.setStateOf(CommodityTariffServer, { dayEntries: [{ dayEntryId: 1, startTime: 0 }] });

        const dayEntries = await node.online(
            { command: true },
            async agent => agent.get(CommodityTariffServer).state.dayEntries,
        );
        expect(dayEntries?.[0]?.dayEntryId).equals(1);
        expect(dayEntries?.[0]?.startTime).equals(0);
        expect(dayEntries?.[0]?.randomizationType).equals(undefined);

        await node.close();
    });

    it("still falls back to the spec's None default when Randomization is supported and the field is omitted", async () => {
        const node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(
                CommodityTariffServer.with(CommodityTariff.Feature.Pricing, CommodityTariff.Feature.Randomization).set({
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
                    defaultRandomizationOffset: null,
                    defaultRandomizationType: null,
                }),
            ),
        });

        await node.setStateOf(CommodityTariffServer, { dayEntries: [{ dayEntryId: 1, startTime: 0 }] });

        const dayEntries = await node.online(
            { command: true },
            async agent => agent.get(CommodityTariffServer).state.dayEntries,
        );
        // Application Cluster Spec § 9.12.5.10 DayEntryStruct field table: RandomizationType's Fallback is
        // "None" (0) — an omitted field reads back as None once the feature that gates it is supported,
        // not `undefined`.
        expect(dayEntries?.[0]?.randomizationType).equals(CommodityTariff.DayEntryRandomizationType.None);

        await node.close();
    });
});
