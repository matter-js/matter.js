/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TimeFormatLocalization {
    /**
     * These are optional features supported by TimeFormatLocalizationCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.4.4
     */
    export enum Feature {
        /**
         * CalendarFormat (CALFMT)
         *
         * The Node can be configured to use different calendar formats when conveying values to a user.
         */
        CalendarFormat = "CalendarFormat"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.4.5.2
     */
    export enum CalendarType {
        /**
         * Dates conveyed using the Buddhist calendar
         */
        Buddhist = 0,

        /**
         * Dates conveyed using the Chinese calendar
         */
        Chinese = 1,

        /**
         * Dates conveyed using the Coptic calendar
         */
        Coptic = 2,

        /**
         * Dates conveyed using the Ethiopian calendar
         */
        Ethiopian = 3,

        /**
         * Dates conveyed using the Gregorian calendar
         */
        Gregorian = 4,

        /**
         * Dates conveyed using the Hebrew calendar
         */
        Hebrew = 5,

        /**
         * Dates conveyed using the Indian calendar
         */
        Indian = 6,

        /**
         * Dates conveyed using the Islamic calendar
         */
        Islamic = 7,

        /**
         * Dates conveyed using the Japanese calendar
         */
        Japanese = 8,

        /**
         * Dates conveyed using the Korean calendar
         */
        Korean = 9,

        /**
         * Dates conveyed using the Persian calendar
         */
        Persian = 10,

        /**
         * Dates conveyed using the Taiwanese calendar
         */
        Taiwanese = 11,

        /**
         * calendar implied from active locale
         */
        UseActiveLocale = 255
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.4.5.1
     */
    export enum HourFormat {
        /**
         * Time conveyed with a 12-hour clock
         */
        "12Hr" = 0,

        /**
         * Time conveyed with a 24-hour clock
         */
        "24Hr" = 1,

        /**
         * Use active locale clock
         */
        UseActiveLocale = 255
    }

    /**
     * A TimeFormatLocalizationCluster supports these elements if it supports feature CalendarFormat.
     */
    export const CalendarFormatComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the calendar format that the Node is currently configured to use when conveying dates.
             *
             * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
             * attribute.
             *
             * If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the calendar type, and
             * if ActiveLocale is not present, the calendar type is unknown.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.2
             */
            activeCalendarType: WritableAttribute(
                0x1,
                TlvEnum<CalendarType>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT contain
             * any duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. The maximum
             * length of the SupportedCalendarTypes list shall be equivalent to the number of enumerations within
             * CalendarTypeEnum.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.3
             */
            supportedCalendarTypes: FixedAttribute(0x2, TlvArray(TlvEnum<CalendarType>()), { default: [] })
        }
    });

    /**
     * These elements and properties are present in all TimeFormatLocalization clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x2c,
        name: "TimeFormatLocalization",
        revision: 1,

        features: {
            /**
             * The Node can be configured to use different calendar formats when conveying values to a user.
             */
            calendarFormat: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates the format that the Node is currently configured to use when conveying the hour unit of time.
             *
             * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
             * attribute.
             *
             * If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour format, and
             * if ActiveLocale is not present, the hour format is unknown.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.1
             */
            hourFormat: WritableAttribute(
                0x0,
                TlvEnum<HourFormat>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        },

        /**
         * This metadata controls which TimeFormatLocalizationCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { calendarFormat: true }, component: CalendarFormatComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have
     * differing preferences for how dates and times are conveyed. As such, Nodes that visually or audibly convey time
     * information need a mechanism by which they can be configured to use a user’s preferred format.
     *
     * This cluster supports an interface to a Node. It provides attributes for determining and configuring time and
     * date formatting information that a Node shall utilize when conveying values to a user.
     *
     * TimeFormatLocalizationCluster supports optional features that you can enable with the
     * TimeFormatLocalizationCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const CALFMT = { calendarFormat: true };

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
            activeCalendarType: MutableCluster.AsConditional(
                CalendarFormatComponent.attributes.activeCalendarType,
                { mandatoryIf: [CALFMT] }
            ),
            supportedCalendarTypes: MutableCluster.AsConditional(
                CalendarFormatComponent.attributes.supportedCalendarTypes,
                { mandatoryIf: [CALFMT] }
            )
        }
    });

    /**
     * This cluster supports all TimeFormatLocalization features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type TimeFormatLocalizationCluster = TimeFormatLocalization.Cluster;
export const TimeFormatLocalizationCluster = TimeFormatLocalization.Cluster;
ClusterRegistry.register(TimeFormatLocalization.Complete);
