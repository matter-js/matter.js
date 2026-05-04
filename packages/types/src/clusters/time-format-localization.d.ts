/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the TimeFormatLocalization cluster.
 *
 * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have differing
 * preferences for how dates and times are conveyed. As such, Nodes that visually or audibly convey time information
 * need a mechanism by which they can be configured to use a user’s preferred format.
 *
 * This cluster supports an interface to a Node. It provides attributes for determining and configuring time and date
 * formatting information that a Node shall utilize when conveying values to a user.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.4
 */
export declare namespace TimeFormatLocalization {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x002c;

    /**
     * Textual cluster identifier.
     */
    export const name: "TimeFormatLocalization";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the TimeFormatLocalization cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TimeFormatLocalization} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the format that the Node is currently configured to use when conveying the hour unit of time.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour
         * format, and if ActiveLocale is not present, the hour format is unknown.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.1
         */
        hourFormat: HourFormat;
    }

    /**
     * {@link TimeFormatLocalization} supports these elements if it supports feature "CalendarFormat".
     */
    export interface CalendarFormatAttributes {
        /**
         * Indicates the calendar format that the Node is currently configured to use when conveying dates.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the calendar
         * type, and if ActiveLocale is not present, the calendar type is unknown.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.2
         */
        activeCalendarType: CalendarType;

        /**
         * Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT contain any
         * duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. The maximum length
         * of the SupportedCalendarTypes list shall be equivalent to the number of enumerations within CalendarTypeEnum.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.3
         */
        supportedCalendarTypes: CalendarType[];
    }

    /**
     * Attributes that may appear in {@link TimeFormatLocalization}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the format that the Node is currently configured to use when conveying the hour unit of time.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour
         * format, and if ActiveLocale is not present, the hour format is unknown.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.1
         */
        hourFormat: HourFormat;

        /**
         * Indicates the calendar format that the Node is currently configured to use when conveying dates.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the calendar
         * type, and if ActiveLocale is not present, the calendar type is unknown.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.2
         */
        activeCalendarType: CalendarType;

        /**
         * Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT contain any
         * duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. The maximum length
         * of the SupportedCalendarTypes list shall be equivalent to the number of enumerations within CalendarTypeEnum.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.4.6.3
         */
        supportedCalendarTypes: CalendarType[];
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { calendarFormat: true }, attributes: CalendarFormatAttributes }
    ];
    export type Features = "CalendarFormat";

    /**
     * These are optional features supported by TimeFormatLocalizationCluster.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.4.4
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
     * @see {@link MatterSpecification.v151.Core} § 11.4.5.1
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
     * @see {@link MatterSpecification.v151.Core} § 11.4.5.2
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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link TimeFormatLocalization}.
     */
    export const Cluster: ClusterType.WithCompat<typeof TimeFormatLocalization, TimeFormatLocalization>;

    /**
     * @deprecated Use {@link TimeFormatLocalization}.
     */
    export const Complete: typeof TimeFormatLocalization;

    export const Typing: TimeFormatLocalization;
}

/**
 * @deprecated Use {@link TimeFormatLocalization}.
 */
export declare const TimeFormatLocalizationCluster: typeof TimeFormatLocalization;

export interface TimeFormatLocalization extends ClusterTyping {
    Attributes: TimeFormatLocalization.Attributes;
    Features: TimeFormatLocalization.Features;
    Components: TimeFormatLocalization.Components;
}
