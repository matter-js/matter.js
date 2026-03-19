/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { CommodityPrice } from "@matter/types/clusters/commodity-price";

export namespace CommodityPriceInterface {
    export interface Base {
        /**
         * Upon receipt, this shall generate a GetDetailedPrice Response command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.1
         */
        getDetailedPriceRequest(request: CommodityPrice.GetDetailedPriceRequest): MaybePromise<CommodityPrice.GetDetailedPriceResponse>;
    }

    export interface Forecasting {
        /**
         * Upon receipt, this shall generate a GetDetailedForecast Response command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.3
         */
        getDetailedForecastRequest(request: CommodityPrice.GetDetailedForecastRequest): MaybePromise<CommodityPrice.GetDetailedForecastResponse>;
    }
}

export type CommodityPriceInterface = {
    components: [
        { flags: {}, methods: CommodityPriceInterface.Base },
        { flags: { forecasting: true }, methods: CommodityPriceInterface.Forecasting }
    ]
};
