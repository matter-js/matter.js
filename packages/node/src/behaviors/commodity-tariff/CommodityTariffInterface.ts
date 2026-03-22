/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { CommodityTariff } from "@matter/types/clusters/commodity-tariff";

export namespace CommodityTariffInterface {
    export interface Base {
        /**
         * The GetTariffComponent command allows a client to request information for a tariff component identifier that
         * may no longer be available in the TariffPeriods attributes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
         */
        getTariffComponent(request: CommodityTariff.GetTariffComponentRequest): MaybePromise<CommodityTariff.GetTariffComponentResponse>;

        /**
         * The GetDayEntry command allows a client to request information for a calendar day entry identifier that may
         * no longer be available in the CalendarPeriods or IndividualDays attributes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
         */
        getDayEntry(request: CommodityTariff.GetDayEntryRequest): MaybePromise<CommodityTariff.GetDayEntryResponse>;
    }
}

export type CommodityTariffInterface = { components: [{ flags: {}, methods: CommodityTariffInterface.Base }] };
