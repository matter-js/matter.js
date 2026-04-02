/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { TariffUnit } from "../globals/TariffUnit.js";
import type { Currency } from "../globals/Currency.js";
import type { MaybePromise } from "@matter/general";
import type { TariffPriceType } from "../globals/TariffPriceType.js";

/**
 * Definitions for the CommodityPrice cluster.
 *
 * The Commodity Price Cluster provides the mechanism for communicating Gas, Energy, or Water pricing information within
 * the premises.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 9.9
 */
export declare namespace CommodityPrice {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0095;

    /**
     * Textual cluster identifier.
     */
    export const name: "CommodityPrice";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the CommodityPrice cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link CommodityPrice} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the unit of measure for all pricing reported by this cluster.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.1
         */
        tariffUnit: TariffUnit;

        /**
         * Indicates the currency for all pricing reported by this cluster. If the current currency is unknown, or
         * cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.2
         */
        currency: Currency | null;

        /**
         * Indicates the current price. If the current price is unknown, or cannot be determined, the value shall be
         * null.
         *
         * The Description and Components fields shall be omitted in this attribute's value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.3
         */
        currentPrice: CommodityPriceStruct | null;
    }

    /**
     * {@link CommodityPrice} supports these elements if it supports feature "Forecasting".
     */
    export interface ForecastingAttributes {
        /**
         * Indicates the forecast of upcoming price changes. If the forecast is unable to be determined, this list shall
         * be empty.
         *
         * The list entries shall be in time order:
         *
         *   - All entries except the last one shall have a non-null PeriodEnd.
         *
         *   - For all entries except the first one, PeriodStart shall be greater than the previous entry's PeriodEnd.
         *
         * The Description and Components fields shall be omitted from CommodityPriceStructs in this attribute's value.
         *
         * If the PeriodEnd field is null on the value of the CurrentPrice attribute, then this list shall be empty.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.4
         */
        priceForecast: CommodityPriceStruct[];
    }

    /**
     * Attributes that may appear in {@link CommodityPrice}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the unit of measure for all pricing reported by this cluster.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.1
         */
        tariffUnit: TariffUnit;

        /**
         * Indicates the currency for all pricing reported by this cluster. If the current currency is unknown, or
         * cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.2
         */
        currency: Currency | null;

        /**
         * Indicates the current price. If the current price is unknown, or cannot be determined, the value shall be
         * null.
         *
         * The Description and Components fields shall be omitted in this attribute's value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.3
         */
        currentPrice: CommodityPriceStruct | null;

        /**
         * Indicates the forecast of upcoming price changes. If the forecast is unable to be determined, this list shall
         * be empty.
         *
         * The list entries shall be in time order:
         *
         *   - All entries except the last one shall have a non-null PeriodEnd.
         *
         *   - For all entries except the first one, PeriodStart shall be greater than the previous entry's PeriodEnd.
         *
         * The Description and Components fields shall be omitted from CommodityPriceStructs in this attribute's value.
         *
         * If the PeriodEnd field is null on the value of the CurrentPrice attribute, then this list shall be empty.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.6.4
         */
        priceForecast: CommodityPriceStruct[];
    }

    /**
     * {@link CommodityPrice} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall generate a GetDetailedPrice Response command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.1
         */
        getDetailedPriceRequest(request: GetDetailedPriceRequest): MaybePromise<GetDetailedPriceResponse>;
    }

    /**
     * {@link CommodityPrice} supports these elements if it supports feature "Forecasting".
     */
    export interface ForecastingCommands {
        /**
         * Upon receipt, this shall generate a GetDetailedForecast Response command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.3
         */
        getDetailedForecastRequest(request: GetDetailedForecastRequest): MaybePromise<GetDetailedForecastResponse>;
    }

    /**
     * Commands that may appear in {@link CommodityPrice}.
     */
    export interface Commands extends
        BaseCommands,
        ForecastingCommands
    {}

    /**
     * {@link CommodityPrice} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when the value of the CurrentPrice attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.8.1
         */
        priceChange?: PriceChangeEvent;
    }

    /**
     * Events that may appear in {@link CommodityPrice}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the value of the CurrentPrice attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.8.1
         */
        priceChange: PriceChangeEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { forecasting: true }, attributes: ForecastingAttributes, commands: ForecastingCommands }
    ];
    export type Features = "Forecasting";

    /**
     * These are optional features supported by CommodityPriceCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.4
     */
    export enum Feature {
        /**
         * Forecasting (FORE)
         *
         * Forecasts upcoming pricing
         */
        Forecasting = "Forecasting"
    }

    /**
     * This represents a price over a given period.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3
     */
    export declare class CommodityPriceStruct {
        constructor(values?: Partial<CommodityPriceStruct>);

        /**
         * This field shall indicate the beginning timestamp in UTC of the period covered by the price indicated in the
         * Price field, or the price level indicated in the Price Level field, or both.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.1
         */
        periodStart: number;

        /**
         * This field shall indicate the ending timestamp in UTC of the period covered by the price indicated in the
         * Price field, or the price level indicated in the Price Level field, or both.
         *
         * If this field is null, then the period has no definite end.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.2
         */
        periodEnd: number | null;

        /**
         * This field shall indicate the price of the commodity per TariffUnit.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.3
         */
        price?: number | bigint;

        /**
         * This field shall indicate the tariff price level.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.4
         */
        priceLevel?: number;

        /**
         * This field shall indicate a description of the pricing plan yielding the value of the Price field, or the
         * Price Level field. For example, this field may contain the name of the selected billing plan.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.5
         */
        description?: string;

        /**
         * This field shall indicate a list of the components that comprise the value in the Price field. For example,
         * if a pricing plan has a base price and a surcharge for a given time of day, it may have two entries in the
         * Components field.
         *
         * If this field is not empty, the Price fields in the list shall sum to the value in the Price field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.3.6
         */
        components?: CommodityPriceComponent[];
    };

    /**
     * Upon receipt, this shall generate a GetDetailedPrice Response command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.1
     */
    export declare class GetDetailedPriceRequest {
        constructor(values?: Partial<GetDetailedPriceRequest>);

        /**
         * This field shall indicate which fields on the CommodityPriceStruct in the
         * GetDetailedPriceResponseCurrentPrice field will be included.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.1.1
         */
        details: CommodityPriceDetail;
    };

    /**
     * This command shall be generated in response to a GetDetailedPrice Request command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.2
     */
    export declare class GetDetailedPriceResponse {
        constructor(values?: Partial<GetDetailedPriceResponse>);

        /**
         * This field shall indicate the current price. Unlike the value returned from the CurrentPrice attribute, the
         * Description and Components fields may be populated based on the value of the GetDetailedPriceRequestDetails
         * field.
         *
         * If the current price is unknown, or cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.2.1
         */
        currentPrice: CommodityPriceStruct | null;
    };

    /**
     * Upon receipt, this shall generate a GetDetailedForecast Response command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.3
     */
    export declare class GetDetailedForecastRequest {
        constructor(values?: Partial<GetDetailedForecastRequest>);

        /**
         * This field shall indicate which fields on the CommodityPriceStructs in the
         * GetDetailedForecastResponsePriceForecast field will be included.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.3.1
         */
        details: CommodityPriceDetail;
    };

    /**
     * This command shall be generated in response to a GetDetailedForecast Request command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.4
     */
    export declare class GetDetailedForecastResponse {
        constructor(values?: Partial<GetDetailedForecastResponse>);

        /**
         * This field shall indicate the current forecast of upcoming price changes. Unlike the value returned from the
         * PriceForecast attribute, the Description and Components fields may be populated on each CommodityPriceStruct
         * based on the value of the GetDetailedPriceRequestDetails field.
         *
         * If the forecast is unable to be determined, this list shall be empty.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.7.4.1
         */
        priceForecast: CommodityPriceStruct[];
    };

    /**
     * This event shall be generated when the value of the CurrentPrice attribute changes.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.8.1
     */
    export declare class PriceChangeEvent {
        constructor(values?: Partial<PriceChangeEvent>);

        /**
         * This field shall be the new value of the CurrentPrice attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.8.1.1
         */
        currentPrice: CommodityPriceStruct | null;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.1
     */
    export declare class CommodityPriceDetail {
        constructor(values?: Partial<CommodityPriceDetail> | number);

        /**
         * A textual description of a price; e.g. the name of a rate plan.
         */
        description?: boolean;

        /**
         * A breakdown of the component parts of a price; e.g. generation, delivery, etc.
         */
        components?: boolean;
    };

    /**
     * This represents a component of a given price; it is only used in the Components field.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.2
     */
    export declare class CommodityPriceComponent {
        constructor(values?: Partial<CommodityPriceComponent>);

        /**
         * This field shall indicate the component price of the commodity per TariffUnit, with the currency indicated by
         * the currency of the Price field of the parent CommodityPriceStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.2.1
         */
        price: number | bigint;

        /**
         * This field shall indicate the source of the price component.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.2.3
         */
        source: TariffPriceType;

        /**
         * This field shall indicate a description of the pricing plan yielding the value of the Price field. For
         * example, this field may contain the name of the current block of the selected billing plan, or the name of
         * the time of usage tier.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.2.4
         */
        description?: string;

        /**
         * This field shall indicate the ID of the associated TariffComponent for this price component. If there is no
         * associated TariffComponent, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.9.5.2.5
         */
        tariffComponentId?: number;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link CommodityPrice}.
     */
    export const Cluster: typeof CommodityPrice;

    /**
     * @deprecated Use {@link CommodityPrice}.
     */
    export const Complete: typeof CommodityPrice;

    export const Typing: CommodityPrice;
}

/**
 * @deprecated Use {@link CommodityPrice}.
 */
export declare const CommodityPriceCluster: typeof CommodityPrice;

export interface CommodityPrice extends ClusterTyping {
    Attributes: CommodityPrice.Attributes;
    Commands: CommodityPrice.Commands;
    Events: CommodityPrice.Events;
    Features: CommodityPrice.Features;
    Components: CommodityPrice.Components;
}
