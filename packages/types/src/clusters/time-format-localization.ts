/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { TimeFormatLocalization as TimeFormatLocalizationModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TimeFormatLocalization cluster.
 */
export namespace TimeFormatLocalization {
    /**
     * {@link TimeFormatLocalization} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the format that the Node is currently configured to use when conveying the hour unit of time.
             *
             * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
             * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour
             * format, and if ActiveLocale is not present, the hour format is unknown.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.1
             */
            hourFormat: HourFormat;
        }
    }

    /**
     * {@link TimeFormatLocalization} supports these elements if it supports feature "CalendarFormat".
     */
    export namespace CalendarFormatComponent {
        export interface Attributes {
            /**
             * Indicates the calendar format that the Node is currently configured to use when conveying dates.
             *
             * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
             * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the
             * calendar type, and if ActiveLocale is not present, the calendar type is unknown.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.2
             */
            activeCalendarType: CalendarType;

            /**
             * Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT contain
             * any duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. The maximum
             * length of the SupportedCalendarTypes list shall be equivalent to the number of enumerations within
             * CalendarTypeEnum.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.4.6.3
             */
            readonly supportedCalendarTypes: CalendarType[];
        }
    }

    /**
     * Attributes that may appear in {@link TimeFormatLocalization}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the format that the Node is currently configured to use when conveying the hour unit of time.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour
         * format, and if ActiveLocale is not present, the hour format is unknown.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.4.6.1
         */
        hourFormat: HourFormat;

        /**
         * Indicates the calendar format that the Node is currently configured to use when conveying dates.
         *
         * If not UseActiveLocale, this value shall take priority over any unit implied through the ActiveLocale
         * attribute. If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the calendar
         * type, and if ActiveLocale is not present, the calendar type is unknown.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.4.6.2
         */
        activeCalendarType: CalendarType;

        /**
         * Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT contain any
         * duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. The maximum length
         * of the SupportedCalendarTypes list shall be equivalent to the number of enumerations within CalendarTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.4.6.3
         */
        readonly supportedCalendarTypes: CalendarType[];
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { calendarFormat: true }, attributes: CalendarFormatComponent.Attributes }
    ];
    export type Features = "CalendarFormat";

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

    export const id = ClusterId(0x2c);
    export const name = "TimeFormatLocalization" as const;
    export const revision = 1;
    export const schema = TimeFormatLocalizationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof TimeFormatLocalization;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TimeFormatLocalization` instead of
     * `TimeFormatLocalization.Complete`)
     */
    export type Complete = typeof TimeFormatLocalization;

    export declare const Complete: Complete;
    export declare const Typing: TimeFormatLocalization;
}

ClusterNamespace.define(TimeFormatLocalization);
export type TimeFormatLocalizationCluster = TimeFormatLocalization.Cluster;
export const TimeFormatLocalizationCluster = TimeFormatLocalization.Cluster;
export interface TimeFormatLocalization extends ClusterTyping { Attributes: TimeFormatLocalization.Attributes; Features: TimeFormatLocalization.Features; Components: TimeFormatLocalization.Components }
