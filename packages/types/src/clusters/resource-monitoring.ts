/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    FixedAttribute,
    OptionalAttribute,
    OptionalWritableAttribute,
    OptionalCommand,
    TlvNoResponse
} from "../cluster/Cluster.js";
import { TlvPercent, TlvEnum, TlvEpochS } from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";

export namespace ResourceMonitoring {
    /**
     * These are optional features supported by ResourceMonitoringCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.4
     */
    export enum Feature {
        /**
         * Condition (CON)
         *
         * Supports monitoring the condition of the resource in percentage
         */
        Condition = "Condition",

        /**
         * Warning (WRN)
         *
         * Supports warning indication
         */
        Warning = "Warning",

        /**
         * ReplacementProductList (REP)
         *
         * Supports specifying the list of replacement products
         */
        ReplacementProductList = "ReplacementProductList"
    }

    /**
     * Indicates the direction in which the condition of the resource changes over time.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.5.1
     */
    export enum DegradationDirection {
        /**
         * The degradation of the resource is indicated by an upwards moving/increasing value
         */
        Up = 0,

        /**
         * The degradation of the resource is indicated by a downwards moving/decreasing value
         */
        Down = 1
    }

    /**
     * Indicate the type of identifier used to describe the product. Devices SHOULD use globally-recognized IDs over OEM
     * specific ones.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.5.3
     */
    export enum ProductIdentifierType {
        /**
         * 12-digit Universal Product Code
         */
        Upc = 0,

        /**
         * 8-digit Global Trade Item Number
         */
        Gtin8 = 1,

        /**
         * 13-digit European Article Number
         */
        Ean = 2,

        /**
         * 14-digit Global Trade Item Number
         */
        Gtin14 = 3,

        /**
         * Original Equipment Manufacturer part number
         */
        Oem = 4
    }

    /**
     * Indicates the product identifier that can be used as a replacement for the resource.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.5.4
     */
    export const TlvReplacementProduct = TlvObject({
        productIdentifierType: TlvField(0, TlvEnum<ProductIdentifierType>()),
        productIdentifierValue: TlvField(1, TlvString.bound({ maxLength: 20 }))
    });

    /**
     * Indicates the product identifier that can be used as a replacement for the resource.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.5.4
     */
    export interface ReplacementProduct extends TypeFromSchema<typeof TlvReplacementProduct> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 2.8.5.2
     */
    export enum ChangeIndication {
        /**
         * Resource is in good condition, no intervention required
         */
        Ok = 0,

        /**
         * Resource will be exhausted soon, intervention will shortly be required
         */
        Warning = 1,

        /**
         * Resource is exhausted, immediate intervention is required
         */
        Critical = 2
    }

    /**
     * A ResourceMonitoringCluster supports these elements if it supports feature Condition.
     */
    export const ConditionComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the current condition of the resource in percent.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.1
             */
            condition: Attribute(0x0, TlvPercent),

            /**
             * Indicates the direction of change for the condition of the resource over time, which helps to determine
             * whether a higher or lower condition value is considered optimal.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.2
             */
            degradationDirection: FixedAttribute(0x1, TlvEnum<DegradationDirection>())
        }
    });

    /**
     * A ResourceMonitoringCluster supports these elements if it supports feature ReplacementProductList.
     */
    export const ReplacementProductListComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the list of supported products that may be used as replacements for the current resource. Each
             * item in this list represents a unique ReplacementProductStruct.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.6
             */
            replacementProductList: FixedAttribute(
                0x5,
                TlvArray(TlvReplacementProduct, { maxLength: 5 }),
                { default: [] }
            )
        }
    });

    /**
     * ResourceMonitoring is a derived cluster, not to be used directly. These elements are present in all clusters
     * derived from ResourceMonitoring.
     */
    export const Base = MutableCluster.Component({
        features: {
            /**
             * Supports monitoring the condition of the resource in percentage
             */
            condition: BitFlag(0),

            /**
             * Supports warning indication
             */
            warning: BitFlag(1),

            /**
             * Supports specifying the list of replacement products
             */
            replacementProductList: BitFlag(2)
        },

        name: "ResourceMonitoring",
        revision: 1,

        attributes: {
            /**
             * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the
             * current requirement to change the resource.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.3
             */
            changeIndication: Attribute(0x2, TlvEnum<ChangeIndication>()),

            /**
             * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
             * installed. A value of false shall indicate that a resource is not installed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.4
             */
            inPlaceIndicator: OptionalAttribute(0x3, TlvBoolean),

            /**
             * This attribute may indicates the time at which the resource has been changed, if supported by the server.
             * The attribute shall be null if it was never set or is unknown.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.6.5
             */
            lastChangedTime: OptionalWritableAttribute(
                0x4,
                TlvNullable(TlvEpochS),
                { persistent: true, default: null }
            )
        },

        commands: {
            /**
             * Upon receipt, the device shall reset the Condition and ChangeIndicator attributes, indicating full
             * resource availability and readiness for use, as initially configured. Invocation of this command may
             * cause the LastChangedTime to be updated automatically based on the clock of the server, if the server
             * supports setting the attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.8.7.1
             */
            resetCondition: OptionalCommand(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        },

        /**
         * This metadata controls which ResourceMonitoringCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { condition: true }, component: ConditionComponent },
            { flags: { replacementProductList: true }, component: ReplacementProductListComponent }
        )
    });

    const CON = { condition: true };
    const REP = { replacementProductList: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster.Component({
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            condition: MutableCluster.AsConditional(ConditionComponent.attributes.condition, { mandatoryIf: [CON] }),
            degradationDirection: MutableCluster.AsConditional(
                ConditionComponent.attributes.degradationDirection,
                { mandatoryIf: [CON] }
            ),
            replacementProductList: MutableCluster.AsConditional(
                ReplacementProductListComponent.attributes.replacementProductList,
                { mandatoryIf: [REP] }
            )
        },

        commands: Base.commands
    });

    /**
     * This cluster supports all ResourceMonitoring features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}
