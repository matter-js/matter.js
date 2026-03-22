/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalCommand, OptionalEvent } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvEpochS, TlvInt64, TlvInt16, TlvEnum, TlvUInt32, TlvUInt16, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvString } from "../tlv/TlvString.js";
import { TariffPriceType } from "../globals/TariffPriceType.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TariffUnit } from "../globals/TariffUnit.js";
import { TlvCurrency } from "../globals/Currency.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CommodityPrice {
    /**
     * These are optional features supported by CommodityPriceCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.4
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
     * This represents a component of a given price; it is only used in the Components field.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2
     */
    export const TlvCommodityPriceComponent = TlvObject({
        /**
         * This field shall indicate the component price of the commodity per TariffUnit, with the currency indicated by
         * the currency of the Price field of the parent CommodityPriceStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2.1
         */
        price: TlvField(0, TlvInt64),

        /**
         * This field shall indicate the source of the price component.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2.3
         */
        source: TlvField(1, TlvEnum<TariffPriceType>()),

        /**
         * This field shall indicate a description of the pricing plan yielding the value of the Price field. For
         * example, this field may contain the name of the current block of the selected billing plan, or the name of
         * the time of usage tier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2.4
         */
        description: TlvOptionalField(2, TlvString.bound({ maxLength: 32 })),

        /**
         * This field shall indicate the ID of the associated TariffComponent for this price component. If there is no
         * associated TariffComponent, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2.5
         */
        tariffComponentId: TlvOptionalField(3, TlvUInt32)
    });

    /**
     * This represents a component of a given price; it is only used in the Components field.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.2
     */
    export interface CommodityPriceComponent extends TypeFromSchema<typeof TlvCommodityPriceComponent> {}

    /**
     * This represents a price over a given period.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3
     */
    export const TlvCommodityPriceStruct = TlvObject({
        /**
         * This field shall indicate the beginning timestamp in UTC of the period covered by the price indicated in the
         * Price field, or the price level indicated in the Price Level field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.1
         */
        periodStart: TlvField(0, TlvEpochS),

        /**
         * This field shall indicate the ending timestamp in UTC of the period covered by the price indicated in the
         * Price field, or the price level indicated in the Price Level field, or both.
         *
         * If this field is null, then the period has no definite end.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.2
         */
        periodEnd: TlvField(1, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the price of the commodity per TariffUnit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.3
         */
        price: TlvOptionalField(2, TlvInt64),

        /**
         * This field shall indicate the tariff price level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.4
         */
        priceLevel: TlvOptionalField(3, TlvInt16),

        /**
         * This field shall indicate a description of the pricing plan yielding the value of the Price field, or the
         * Price Level field. For example, this field may contain the name of the selected billing plan.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.5
         */
        description: TlvOptionalField(4, TlvString.bound({ maxLength: 32 })),

        /**
         * This field shall indicate a list of the components that comprise the value in the Price field. For example,
         * if a pricing plan has a base price and a surcharge for a given time of day, it may have two entries in the
         * Components field.
         *
         * If this field is not empty, the Price fields in the list shall sum to the value in the Price field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3.6
         */
        components: TlvOptionalField(5, TlvArray(TlvCommodityPriceComponent, { maxLength: 10 }))
    });

    /**
     * This represents a price over a given period.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.3
     */
    export interface CommodityPriceStruct extends TypeFromSchema<typeof TlvCommodityPriceStruct> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.5.1
     */
    export const CommodityPriceDetail = {
        /**
         * A textual description of a price; e.g. the name of a rate plan.
         */
        description: BitFlag(0),

        /**
         * A breakdown of the component parts of a price; e.g. generation, delivery, etc.
         */
        components: BitFlag(1)
    };

    /**
     * Input to the CommodityPrice getDetailedForecastRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.3
     */
    export const TlvGetDetailedForecastRequest = TlvObject({
        /**
         * This field shall indicate which fields on the CommodityPriceStructs in the
         * GetDetailedForecastResponsePriceForecast field will be included.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.3.1
         */
        details: TlvField(0, TlvBitmap(TlvUInt16, CommodityPriceDetail))
    });

    /**
     * Input to the CommodityPrice getDetailedForecastRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.3
     */
    export interface GetDetailedForecastRequest extends TypeFromSchema<typeof TlvGetDetailedForecastRequest> {}

    /**
     * This command shall be generated in response to a GetDetailedForecast Request command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.4
     */
    export const TlvGetDetailedForecastResponse = TlvObject({
        /**
         * This field shall indicate the current forecast of upcoming price changes. Unlike the value returned from the
         * PriceForecast attribute, the Description and Components fields may be populated on each CommodityPriceStruct
         * based on the value of the GetDetailedPriceRequestDetails field.
         *
         * If the forecast is unable to be determined, this list shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.4.1
         */
        priceForecast: TlvField(0, TlvArray(TlvCommodityPriceStruct, { maxLength: 56 }))
    });

    /**
     * This command shall be generated in response to a GetDetailedForecast Request command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.4
     */
    export interface GetDetailedForecastResponse extends TypeFromSchema<typeof TlvGetDetailedForecastResponse> {}

    /**
     * Input to the CommodityPrice getDetailedPriceRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.1
     */
    export const TlvGetDetailedPriceRequest = TlvObject({
        /**
         * This field shall indicate which fields on the CommodityPriceStruct in the
         * GetDetailedPriceResponseCurrentPrice field will be included.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.1.1
         */
        details: TlvField(0, TlvBitmap(TlvUInt16, CommodityPriceDetail))
    });

    /**
     * Input to the CommodityPrice getDetailedPriceRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.1
     */
    export interface GetDetailedPriceRequest extends TypeFromSchema<typeof TlvGetDetailedPriceRequest> {}

    /**
     * This command shall be generated in response to a GetDetailedPrice Request command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.2
     */
    export const TlvGetDetailedPriceResponse = TlvObject({
        /**
         * This field shall indicate the current price. Unlike the value returned from the CurrentPrice attribute, the
         * Description and Components fields may be populated based on the value of the GetDetailedPriceRequestDetails
         * field.
         *
         * If the current price is unknown, or cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.2.1
         */
        currentPrice: TlvField(0, TlvNullable(TlvCommodityPriceStruct))
    });

    /**
     * This command shall be generated in response to a GetDetailedPrice Request command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.2
     */
    export interface GetDetailedPriceResponse extends TypeFromSchema<typeof TlvGetDetailedPriceResponse> {}

    /**
     * Body of the CommodityPrice priceChange event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.8.1
     */
    export const TlvPriceChangeEvent = TlvObject({
        /**
         * This field shall be the new value of the CurrentPrice attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.9.8.1.1
         */
        currentPrice: TlvField(0, TlvNullable(TlvCommodityPriceStruct))
    });

    /**
     * Body of the CommodityPrice priceChange event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9.8.1
     */
    export interface PriceChangeEvent extends TypeFromSchema<typeof TlvPriceChangeEvent> {}

    /**
     * A CommodityPriceCluster supports these elements if it supports feature Forecasting.
     */
    export const ForecastingComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the forecast of upcoming price changes. If the forecast is unable to be determined, this list
             * shall be empty.
             *
             * The list entries shall be in time order:
             *
             *   - All entries except the last one shall have a non-null PeriodEnd.
             *
             *   - For all entries except the first one, PeriodStart shall be greater than the previous entry’s
             *     PeriodEnd.
             *
             * The Description and Components fields shall be omitted from CommodityPriceStructs in this attribute’s
             * value.
             *
             * If the PeriodEnd field is null on the value of the CurrentPrice attribute, then this list shall be empty.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.6.4
             */
            priceForecast: Attribute(0x3, TlvArray(TlvCommodityPriceStruct, { maxLength: 56 }), { default: [] })
        },

        commands: {
            /**
             * Upon receipt, this shall generate a GetDetailedForecast Response command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.3
             */
            getDetailedForecastRequest: OptionalCommand(
                0x2,
                TlvGetDetailedForecastRequest,
                0x3,
                TlvGetDetailedForecastResponse
            )
        }
    });

    /**
     * These elements and properties are present in all CommodityPrice clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x95,
        name: "CommodityPrice",
        revision: 4,

        features: {
            /**
             * Forecasts upcoming pricing
             */
            forecasting: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates the unit of measure for all pricing reported by this cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.6.1
             */
            tariffUnit: Attribute(0x0, TlvEnum<TariffUnit>()),

            /**
             * Indicates the currency for all pricing reported by this cluster. If the current currency is unknown, or
             * cannot be determined, the value shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.6.2
             */
            currency: Attribute(0x1, TlvNullable(TlvCurrency)),

            /**
             * Indicates the current price. If the current price is unknown, or cannot be determined, the value shall be
             * null.
             *
             * The Description and Components fields shall be omitted in this attribute’s value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.6.3
             */
            currentPrice: Attribute(0x2, TlvNullable(TlvCommodityPriceStruct))
        },

        commands: {
            /**
             * Upon receipt, this shall generate a GetDetailedPrice Response command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.7.1
             */
            getDetailedPriceRequest: OptionalCommand(0x0, TlvGetDetailedPriceRequest, 0x1, TlvGetDetailedPriceResponse)
        },

        events: {
            /**
             * This event shall be generated when the value of the CurrentPrice attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.9.8.1
             */
            priceChange: OptionalEvent(0x0, Priority.Info, TlvPriceChangeEvent)
        },

        /**
         * This metadata controls which CommodityPriceCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { forecasting: true }, component: ForecastingComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Commodity Price Cluster provides the mechanism for communicating Gas, Energy, or Water pricing information
     * within the premises.
     *
     * CommodityPriceCluster supports optional features that you can enable with the CommodityPriceCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const FORE = { forecasting: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            priceForecast: MutableCluster.AsConditional(
                ForecastingComponent.attributes.priceForecast,
                { mandatoryIf: [FORE] }
            )
        },

        commands: {
            ...Cluster.commands,
            getDetailedForecastRequest: MutableCluster.AsConditional(
                ForecastingComponent.commands.getDetailedForecastRequest,
                { optionalIf: [FORE] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all CommodityPrice features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type CommodityPriceCluster = CommodityPrice.Cluster;
export const CommodityPriceCluster = CommodityPrice.Cluster;
ClusterRegistry.register(CommodityPrice.Complete);
