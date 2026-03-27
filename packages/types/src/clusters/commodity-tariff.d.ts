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
import type { MaybePromise } from "@matter/general";
import type { Currency } from "../globals/Currency.js";
import type { PowerThreshold } from "../globals/PowerThreshold.js";
import type { TariffPriceType } from "../globals/TariffPriceType.js";

/**
 * Definitions for the CommodityTariff cluster.
 *
 * The CommodityTariffCluster provides the mechanism for communicating Commodity Tariff information within the premises.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 9.12
 */
export declare namespace CommodityTariff {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0700;

    /**
     * Textual cluster identifier.
     */
    export const name: "CommodityTariff";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the CommodityTariff cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link CommodityTariff} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates basic information about the tariff.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.1
         */
        tariffInfo: TariffInformation | null;

        /**
         * Indicates the unit of the commodity for pricing.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.2
         */
        tariffUnit: TariffUnit | null;

        /**
         * Indicates a timestamp in UTC to denote the time at which the published calendar becomes active. A start
         * date/time of 0x00000000 shall indicate that the calendar should become active immediately.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.3
         */
        startDate: number | null;

        /**
         * Indicates the list of DayEntryStructs included in this calendar.
         *
         * The maximum constraint of this attribute is intended to allow representation of seven days of tariff
         * information at 15 minute intervals.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.4
         */
        dayEntries: DayEntry[] | null;

        /**
         * Indicates the list of DayPatternStructs used in the CalendarPeriodStruct in this calendar.
         *
         * Each day pattern in this list shall define the specific schedule that applies to the days it covers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.5
         */
        dayPatterns: DayPattern[] | null;

        /**
         * Indicates the list of CalendarPeriodStructs comprising this calendar. The CalendarPeriodStructs in this list
         * shall be arranged in increasing order by the value of StartDate.
         *
         * If and only if the value of the StartDate attribute is null, the value of the StartDate field on the first
         * CalendarPeriodStruct in the CalendarPeriods attribute shall also be null, indicating that the period begins
         * immediately. The value of the StartDate field on any subsequent CalendarPeriodStruct in CalendarPeriods shall
         * NOT be null.
         *
         * The active calendar period shall be in effect until the StartDate of the next calendar period.
         *
         * If the calendar is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.6
         */
        calendarPeriods: CalendarPeriod[] | null;

        /**
         * Indicates the list of days to overlay on this calendar.
         *
         * The DayStruct in this list shall be arranged in increasing order by the value of Date. The DayStruct in this
         * list shall not overlap.
         *
         * If the calendar is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.7
         */
        individualDays: Day[] | null;

        /**
         * Indicates the current day’s day entries.
         *
         * If the tariff is not active or CurrentDay information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.8
         */
        currentDay: Day | null;

        /**
         * Indicates the next day’s day entries.
         *
         * If the tariff is not active or NextDay information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.9
         */
        nextDay: Day | null;

        /**
         * Indicates the currently active DayEntryStruct.
         *
         * If the tariff is not active or day entry information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.10
         */
        currentDayEntry: DayEntry | null;

        /**
         * Indicates the UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes were last
         * updated.
         *
         * If the tariff is not active or day entry information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.11
         */
        currentDayEntryDate: number | null;

        /**
         * Indicates the predicted next active DayEntryStruct.
         *
         * If the tariff is not active or is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.12
         */
        nextDayEntry: DayEntry | null;

        /**
         * Indicates the predicted UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes
         * will update to the values in the NextDay, NextDayEntry, and NextTariffComponents attributes, respectively.
         *
         * If the tariff is not active or is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.13
         */
        nextDayEntryDate: number | null;

        /**
         * Indicates a list of TariffComponentStructs for the tariff.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.14
         */
        tariffComponents: TariffComponent[] | null;

        /**
         * Indicates a list of TariffPeriodStructs for the tariff.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.15
         */
        tariffPeriods: TariffPeriod[] | null;

        /**
         * Indicates a list of the currently active TariffComponentStructs.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.16
         */
        currentTariffComponents: TariffComponent[] | null;

        /**
         * Indicates the predicted next active TariffComponentStructs.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.17
         */
        nextTariffComponents: TariffComponent[] | null;
    }

    /**
     * {@link CommodityTariff} supports these elements if it supports feature "Randomization".
     */
    export interface RandomizationAttributes {
        /**
         * Indicates a default randomization offset for DayEntryStructs in this tariff. See RandomizationOffset for
         * details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.18
         */
        defaultRandomizationOffset: number | null;

        /**
         * Indicates a default randomization type for DayEntryStruct in this tariff. See RandomizationType for details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.19
         */
        defaultRandomizationType: DayEntryRandomizationType | null;
    }

    /**
     * Attributes that may appear in {@link CommodityTariff}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates basic information about the tariff.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.1
         */
        tariffInfo: TariffInformation | null;

        /**
         * Indicates the unit of the commodity for pricing.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.2
         */
        tariffUnit: TariffUnit | null;

        /**
         * Indicates a timestamp in UTC to denote the time at which the published calendar becomes active. A start
         * date/time of 0x00000000 shall indicate that the calendar should become active immediately.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.3
         */
        startDate: number | null;

        /**
         * Indicates the list of DayEntryStructs included in this calendar.
         *
         * The maximum constraint of this attribute is intended to allow representation of seven days of tariff
         * information at 15 minute intervals.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.4
         */
        dayEntries: DayEntry[] | null;

        /**
         * Indicates the list of DayPatternStructs used in the CalendarPeriodStruct in this calendar.
         *
         * Each day pattern in this list shall define the specific schedule that applies to the days it covers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.5
         */
        dayPatterns: DayPattern[] | null;

        /**
         * Indicates the list of CalendarPeriodStructs comprising this calendar. The CalendarPeriodStructs in this list
         * shall be arranged in increasing order by the value of StartDate.
         *
         * If and only if the value of the StartDate attribute is null, the value of the StartDate field on the first
         * CalendarPeriodStruct in the CalendarPeriods attribute shall also be null, indicating that the period begins
         * immediately. The value of the StartDate field on any subsequent CalendarPeriodStruct in CalendarPeriods shall
         * NOT be null.
         *
         * The active calendar period shall be in effect until the StartDate of the next calendar period.
         *
         * If the calendar is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.6
         */
        calendarPeriods: CalendarPeriod[] | null;

        /**
         * Indicates the list of days to overlay on this calendar.
         *
         * The DayStruct in this list shall be arranged in increasing order by the value of Date. The DayStruct in this
         * list shall not overlap.
         *
         * If the calendar is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.7
         */
        individualDays: Day[] | null;

        /**
         * Indicates the current day’s day entries.
         *
         * If the tariff is not active or CurrentDay information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.8
         */
        currentDay: Day | null;

        /**
         * Indicates the next day’s day entries.
         *
         * If the tariff is not active or NextDay information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.9
         */
        nextDay: Day | null;

        /**
         * Indicates the currently active DayEntryStruct.
         *
         * If the tariff is not active or day entry information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.10
         */
        currentDayEntry: DayEntry | null;

        /**
         * Indicates the UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes were last
         * updated.
         *
         * If the tariff is not active or day entry information is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.11
         */
        currentDayEntryDate: number | null;

        /**
         * Indicates the predicted next active DayEntryStruct.
         *
         * If the tariff is not active or is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.12
         */
        nextDayEntry: DayEntry | null;

        /**
         * Indicates the predicted UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes
         * will update to the values in the NextDay, NextDayEntry, and NextTariffComponents attributes, respectively.
         *
         * If the tariff is not active or is not available, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.13
         */
        nextDayEntryDate: number | null;

        /**
         * Indicates a list of TariffComponentStructs for the tariff.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.14
         */
        tariffComponents: TariffComponent[] | null;

        /**
         * Indicates a list of TariffPeriodStructs for the tariff.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.15
         */
        tariffPeriods: TariffPeriod[] | null;

        /**
         * Indicates a list of the currently active TariffComponentStructs.
         *
         * If the tariff is unavailable, this attribute shall be empty.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.16
         */
        currentTariffComponents: TariffComponent[] | null;

        /**
         * Indicates the predicted next active TariffComponentStructs.
         *
         * If the tariff is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.17
         */
        nextTariffComponents: TariffComponent[] | null;

        /**
         * Indicates a default randomization offset for DayEntryStructs in this tariff. See RandomizationOffset for
         * details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.18
         */
        defaultRandomizationOffset: number | null;

        /**
         * Indicates a default randomization type for DayEntryStruct in this tariff. See RandomizationType for details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.19
         */
        defaultRandomizationType: DayEntryRandomizationType | null;
    }

    /**
     * {@link CommodityTariff} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * The GetTariffComponent command allows a client to request information for a tariff component identifier that
         * may no longer be available in the TariffPeriods attributes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
         */
        getTariffComponent(request: GetTariffComponentRequest): MaybePromise<GetTariffComponentResponse>;

        /**
         * The GetDayEntry command allows a client to request information for a calendar day entry identifier that may
         * no longer be available in the CalendarPeriods or IndividualDays attributes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
         */
        getDayEntry(request: GetDayEntryRequest): MaybePromise<GetDayEntryResponse>;
    }

    /**
     * Commands that may appear in {@link CommodityTariff}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { randomization: true }, attributes: RandomizationAttributes }
    ];
    export type Features = "Pricing" | "FriendlyCredit" | "AuxiliaryLoad" | "PeakPeriod" | "PowerThreshold" | "Randomization";

    /**
     * These are optional features supported by CommodityTariffCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.4
     */
    export enum Feature {
        /**
         * Pricing (PRICE)
         *
         * Supports information about commodity pricing
         */
        Pricing = "Pricing",

        /**
         * FriendlyCredit (FCRED)
         *
         * Supports information about when friendly credit periods begin and end
         */
        FriendlyCredit = "FriendlyCredit",

        /**
         * AuxiliaryLoad (AUXLD)
         *
         * Supports information about when auxiliary loads should be enabled or disabled
         */
        AuxiliaryLoad = "AuxiliaryLoad",

        /**
         * PeakPeriod (PEAKP)
         *
         * Supports information about peak periods
         */
        PeakPeriod = "PeakPeriod",

        /**
         * PowerThreshold (PWRTHLD)
         *
         * Supports information about power threshold
         */
        PowerThreshold = "PowerThreshold",

        /**
         * Randomization (RNDM)
         *
         * Supports information about randomization of calendar day entries
         */
        Randomization = "Randomization"
    }

    /**
     * This represents particular Tariff Price information.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14
     */
    export interface TariffInformation {
        /**
         * This field shall indicate a label for the tariff.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.1
         */
        tariffLabel: string | null;

        /**
         * This field shall indicate the name of the commodity provider for this tariff.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.2
         */
        providerName: string | null;

        /**
         * This field shall indicate the currency for the value of the Price field on all TariffPriceStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.3
         */
        currency?: Currency | null;

        /**
         * This field shall indicate the mode for metering blocks of usage.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.4
         */
        blockMode: BlockMode | null;
    }

    /**
     * This struct represents a day entry at a particular time of day, along with an optional duration and randomization
     * parameters.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10
     */
    export interface DayEntry {
        /**
         * This field shall indicate an identifier for the day entry which is unique on the server to a set of values:
         *
         *   1. If this identifier is included in the DayEntryIDs associated with a DayPatternStruct, then the
         *      identifier shall be unique to the combination of:
         *
         *     a. the StartTime
         *
         *     b. the Duration, if indicated
         *
         *     c. the DaysOfWeek field in the containing DayPatternStruct
         *
         *   2. Otherwise, if this identifier is included in the DayEntryIDs associated with a DayStruct, then the
         *      identifier shall be unique to the combination of:
         *
         *     a. the StartTime
         *
         *     b. the Duration, if indicated
         *
         *     c. the Date field in the containing DayStruct
         *
         * Once an identifier has been used for a given combination above, it shall never be used for any other
         * combination of these values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10.1
         */
        dayEntryId: number;

        /**
         * This field shall indicate the start time of the DayEntryStruct, expressed as the number of minutes that have
         * elapsed since midnight on the associated days.
         *
         * For example, 6am will be represented by 360 minutes since midnight and 11:30pm will be represented by 1410
         * minutes since midnight.
         *
         * This will differ on days with a day entry in or out of daylight saving time. For example, if the
         * implementation of daylight saving time in a region means that the hour between 2am and 3am will be skipped on
         * the day entry into daylight saving time, then 2am cannot be represented, and 3am will be represented by 120
         * minutes.
         *
         * Similarly, if the implementation of daylight saving time in a region means that the hour between 2am and 3am
         * will be repeated on the date of day entry out of daylight saving time, then the first 2am will be represented
         * by 120 minutes, while the second 2am will be represented by 180 minutes, and 4am will be represented by 300
         * minutes. As such, the maximum start time on this day is 1499, 60 minutes longer than all other days.
         *
         * DayEntryStruct on daylight saving time days SHOULD be handled by a DayStruct in the IndividualDays attribute
         * whose Date field indicates the date of the day entry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10.2
         */
        startTime: number;

        /**
         * This field shall indicate the duration of the day entry, expressed as the number of minutes since the time
         * indicated by the StartTime field.
         *
         * If this field is omitted, the day entry shall end at the StartTime of the DayEntryStruct identified by the
         * next DayEntryID in the containing list. If the DayEntryStruct is the last item in the containing list, then
         * the day entry shall last until the end of the day.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10.3
         */
        duration?: number;

        /**
         * This field shall indicate a randomization offset for this particular day entry in seconds. If this field is
         * not indicated, randomization shall use the value in the DefaultRandomizationOffset attribute.
         *
         *   1. If the value of the RandomizationType field is Fixed, then the value of this field may be negative
         *
         *   2. Otherwise if the value of the RandomizationType field is RandomNegative, then the value of this field
         *      shall be less than or equal to zero
         *
         *   3. Otherwise the value of this field shall be greater than or equal to zero
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10.4
         */
        randomizationOffset?: number;

        /**
         * This field shall indicate a randomization type for this particular day entry. If this field is not indicated,
         * randomization shall use the value in the DefaultRandomizationType attribute.
         *
         * If the calculated value for this field is of type None, no randomization shall be applied to the start of
         * this day entry.
         *
         * If the calculated value for this field is of type Fixed, then the calculated value of the RandomizationOffset
         * field shall be added to the start time of the day entry.
         *
         * If the calculated value for this field is of type Random, then a random number of whole seconds whose
         * absolute value is less than or equal to the calculated value of the RandomizationOffset field shall be added
         * to the start time of the day entry.
         *
         * If the calculated value for this field is of type RandomPositive, then a random non-negative number of whole
         * seconds whose value is less than or equal to the calculated value of the RandomizationOffset field shall be
         * added to the start time of the day entry.
         *
         * If the calculated value for this field is of type RandomNegative, then a random negative number of whole
         * seconds whose value is greater than or equal to the calculated value of the RandomizationOffset field shall
         * be added to the start time of the day entry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10.5
         */
        randomizationType?: DayEntryRandomizationType;
    }

    /**
     * This represents a series of day entries over the course of a day for a given set of days of the week.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12
     */
    export interface DayPattern {
        /**
         * This field shall indicate an identifier for the day pattern. It shall be a unique identifier for the
         * combination of values of the DaysOfWeek and DayEntryIDs fields.
         *
         * Once an identifier has been used for this combination, it shall NOT be used to represent any other
         * combination of these values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.1
         */
        dayPatternId: number;

        /**
         * This field shall indicate which days of the week the associated set of DayEntryStructs applies to. If no bits
         * are set, then this shall be a rotating day. See DayPatternIDs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.2
         */
        daysOfWeek: DayPatternDayOfWeek;

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs to apply during the days specified by
         * DaysOfWeek, ordered by StartTime.
         *
         * This list shall NOT contain two DayEntryIDs for the DayEntryStructs with the same value of the StartTime
         * field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.3
         */
        dayEntryIDs: number[];
    }

    /**
     * This represents a sub period of a calendar, commencing on its StartDate.
     *
     * > [!NOTE]
     *
     * > A 'Calendar Period', while normally considered to be a 3 or 6 month period, could be used for other arbitrary
     *   periods e.g. monthly or quarterly. The minimum resolution is 1 day, although a week would normally be the
     *   smallest interval.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.9
     */
    export interface CalendarPeriod {
        /**
         * This field shall indicate the timestamp in UTC when the calendar period becomes active.
         *
         * A null value shall indicate the calendar period becomes active immediately. See CalendarPeriods attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.9.1
         */
        startDate: number | null;

        /**
         * This field shall indicate a list of DayPatternIDs for the DayPatternStructs in use during this calendar
         * period.
         *
         * If any of the DayPatternStructs referenced by this list has no bits set in DaysOfWeek, then none of the
         * DayPatternStructs referenced by this list shall have any bits set, and the list shall be treated as a
         * rotating set of days.
         *
         * If at least one of the DayPatternStructs referenced by this list has a bit set in DaysOfWeek, then:
         *
         *   1. All of the DayPatternStructs referenced by this list shall have at least one bit set in DaysOfWeek
         *
         *   2. No two DayPatternStructs referenced by this list shall have the same bit set in DaysOfWeek.
         *
         *   3. Every bit defined in DayPatternDayOfWeekBitmap referenced by this list shall be set in DaysOfWeek on one
         *      of the DayPatternStructs.
         *
         * Meeting these constraints ensures that every day of the week during this week has specified day entries, and
         * no day of the week has more than one set of day entries.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.9.2
         */
        dayPatternIDs: number[];
    }

    /**
     * This represents a series of day entries over the course of a day for a specific date.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11
     */
    export interface Day {
        /**
         * This field shall indicate the date the associated set of DayEntryStructs applies to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11.1
         */
        date: number;

        /**
         * This field shall indicate the type of day represented by the struct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11.2
         */
        dayType: DayType;

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs to apply during the date specified by
         * Date, ordered by the value of the StartTime field.
         *
         * This list shall NOT contain two DayEntryIDs for DayEntryStructs with the same value of the StartTime field.
         *
         * If the Randomization feature is supported, every DayEntryStruct whose DayEntryID is included in this field
         * shall have its StartTime field set to a value less than the following DayEntryStruct’s StartTime field minus
         * the calculated value of its RandomizationOffset field. In other words, it should not be possible for a random
         * offset to cause a day entry to begin before the preceding day entry.
         *
         * If the DayType field is not Event:
         *
         *   1. The DayEntryStruct referenced by the first DayEntryID in this list shall have its StartTime field set to
         *      zero.
         *
         *   2. Every DayEntryStruct referenced by this list shall have its Duration field omitted.
         *
         * Otherwise, if the DayType field is Event:
         *
         *   1. Every DayEntryStruct referenced by this list shall NOT have a Duration field whose value, added to the
         *      value of StartTime field, is greater than the value of StartTime field on any subsequent DayEntryStruct
         *      referenced by this list. In other words, day entries with a set duration can not overlap any other day
         *      entries.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11.3
         */
        dayEntryIDs: number[];
    }

    /**
     * This represents components of a tariff.
     *
     * Tariff components typically represent a price or price level, though they may also specify other aspects of a
     * tariff. For example, a tariff component may indicate changes in power thresholds, friendly credit status, or the
     * expected state of auxiliary switches.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16
     */
    export interface TariffComponent {
        /**
         * This field shall indicate an identifier for the tariff component. If the tariff component is not a
         * prediction, this field shall be a unique identifier for the combination of values of the Price, Threshold,
         * FriendlyCredit, AuxiliaryLoad, and PeakPeriod fields with the value of the DayEntryIDs field on the
         * encompassing TariffPeriodStruct.
         *
         * Once an identifier has been used for this combination, it shall NOT be used to represent any other
         * combination of these values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.1
         */
        tariffComponentId: number;

        /**
         * This field shall indicate the price when the tariff component is active.
         *
         * When the Predicted field is set to TRUE, a null value shall indicate that the price and/or price level is not
         * yet available.
         *
         * When the Predicted field is set to FALSE, a null value shall indicate that the server is unable to provide a
         * specific price or price level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.2
         */
        price?: TariffPrice | null;

        /**
         * This field shall indicate whether the calendar is entering a friendly credit period or not.
         *
         * > [!NOTE]
         *
         * > When a meter enters into a Friendly Credit Period with a usable positive credit balance, the consumer will
         *   be allowed to consume energy for the duration of the Friendly Credit Period, regardless of their credit
         *   status while in that period. If, however, the consumer had already run out of credit and supply was
         *   interrupted before entering into the Friendly Credit Period, they will not be allowed to reconnect without
         *   first adding suitable additional credit.
         *
         * > [!NOTE]
         *
         * > At the end of the Friendly Credit Period, the normal delivery rules connected with the accounting functions
         *   of the meter will be resumed, and if the meter’s credit balance has dropped below the disablement threshold
         *   during the Friendly Credit Period, then the meter will disconnect upon resuming normal delivery rules
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.3
         */
        friendlyCredit?: boolean;

        /**
         * This field shall indicate the required state of auxiliary load switches.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.4
         */
        auxiliaryLoad?: AuxiliaryLoadSwitchSettings;

        /**
         * This field shall indicate whether the tariff component represents a peak period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.5
         */
        peakPeriod?: PeakPeriod;

        /**
         * This field shall indicate whether the tariff component represents a power threshold.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.6
         */
        powerThreshold?: PowerThreshold;

        /**
         * This field shall indicate the maximum level of consumption this tariff component applies to, in units
         * specified by the TariffUnit attribute. If the tariff component applies to any level of consumption, this
         * field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.7
         */
        threshold: number | bigint | null;

        /**
         * A free-form label for the tariff component.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.8
         */
        label?: string | null;

        /**
         * This field shall indicate whether the tariff component represents a price prediction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.9
         */
        predicted?: boolean;
    }

    /**
     * This represents the tariff components in effect for a set of calendar day entry IDs.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17
     */
    export interface TariffPeriod {
        /**
         * A free-form label for the tariff period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.1
         */
        label: string | null;

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff components
         * are active.
         *
         * Each DayEntryID shall be included in at most one DayEntryIDs field. In other words, there shall be only one
         * TariffPeriodStruct for each DayEntryID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.2
         */
        dayEntryIDs: number[];

        /**
         * This field shall indicate a list of TariffComponentIDs for the TariffComponentStructs active during the
         * specified day entries.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.3
         */
        tariffComponentIDs: number[];
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.5
     */
    export enum DayEntryRandomizationType {
        /**
         * No randomization applied
         */
        None = 0,

        /**
         * An unchanging offset
         */
        Fixed = 1,

        /**
         * A random value
         */
        Random = 2,

        /**
         * A random positive value
         */
        RandomPositive = 3,

        /**
         * A random negative value
         */
        RandomNegative = 4
    }

    /**
     * The GetTariffComponent command allows a client to request information for a tariff component identifier that may
     * no longer be available in the TariffPeriods attributes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
     */
    export interface GetTariffComponentRequest {
        /**
         * This field shall be used to indicate the TariffComponentID of the DayEntryStruct to be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1.1
         */
        tariffComponentId: number;
    }

    /**
     * The GetTariffComponentResponse command is sent in response to a GetTariffComponent command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2
     */
    export interface GetTariffComponentResponse {
        /**
         * A free-form label for the tariff period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.1
         */
        label: string | null;

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff component is
         * active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.2
         */
        dayEntryIDs: number[];

        /**
         * This field shall indicate the TariffComponentStruct whose TariffComponentID field matches the requested
         * GetTariffComponentTariffComponentID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.3
         */
        tariffComponent: TariffComponent;
    }

    /**
     * The GetDayEntry command allows a client to request information for a calendar day entry identifier that may no
     * longer be available in the CalendarPeriods or IndividualDays attributes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
     */
    export interface GetDayEntryRequest {
        /**
         * This field shall be used to indicate the DayEntryID of the DayEntryStruct to be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3.1
         */
        dayEntryId: number;
    }

    /**
     * The GetDayEntryResponse command is sent in response to a GetDayEntry command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.4
     */
    export interface GetDayEntryResponse {
        dayEntry: DayEntry;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.1
     */
    export interface DayPatternDayOfWeek {
        /**
         * Sunday
         */
        sunday?: boolean;

        /**
         * Monday
         */
        monday?: boolean;

        /**
         * Tuesday
         */
        tuesday?: boolean;

        /**
         * Wednesday
         */
        wednesday?: boolean;

        /**
         * Thursday
         */
        thursday?: boolean;

        /**
         * Friday
         */
        friday?: boolean;

        /**
         * Saturday
         */
        saturday?: boolean;
    }

    /**
     * This enumeration shall indicated the required state of an auxiliary switch.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.2
     */
    export enum AuxiliaryLoadSetting {
        /**
         * The switch should be in the OFF state
         */
        Off = 0,

        /**
         * The switch should be in the ON state
         */
        On = 1,

        /**
         * No state is required
         */
        None = 2
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.3
     */
    export enum DayType {
        /**
         * Standard
         */
        Standard = 0,

        /**
         * Holiday
         */
        Holiday = 1,

        /**
         * Dynamic Pricing
         */
        Dynamic = 2,

        /**
         * Individual Events
         */
        Event = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.4
     */
    export enum PeakPeriodSeverity {
        /**
         * Unused
         */
        Unused = 0,

        /**
         * Low
         */
        Low = 1,

        /**
         * Medium
         */
        Medium = 2,

        /**
         * High
         */
        High = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.6
     */
    export enum BlockMode {
        /**
         * Tariff has no usage blocks
         *
         * This value shall indicate that the tariff has no usage blocks. All Threshold fields on TariffComponentStruct
         * in a tariff whose BlockMode field is set to NoBlock shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.6.1
         */
        NoBlock = 0,

        /**
         * Usage is metered in combined blocks
         *
         * This value shall indicate that all Threshold fields apply to combined usage across all TariffComponentStruct
         * during the billing period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.6.2
         */
        Combined = 1,

        /**
         * Usage is metered separately by tariff component
         *
         * This value shall indicate that all Threshold fields apply only to usage during the active period of the
         * associated TariffComponentStruct in the billing period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.6.3
         */
        Individual = 2
    }

    /**
     * This represents the settings for a given auxiliary load switch in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.7
     */
    export interface AuxiliaryLoadSwitchSettings {
        number: number;
        requiredState: AuxiliaryLoadSetting;
    }

    /**
     * This represents the set of auxiliary load settings in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.8
     */
    export interface AuxiliaryLoadSwitchesSettings {
        switchStates: AuxiliaryLoadSwitchSettings[];
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13
     */
    export interface PeakPeriod {
        /**
         * This field shall indicate the severity of the peak period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13.1
         */
        severity: PeakPeriodSeverity;

        /**
         * This field shall indicate the PeakPeriod number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13.2
         */
        peakPeriod: number;
    }

    /**
     * This indicates a price or price level for a given tariff component, as well as what type of pricing it represents
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15
     */
    export interface TariffPrice {
        /**
         * This field shall indicate the type of price for the Price or PriceLevel fields.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.1
         */
        priceType: TariffPriceType;

        /**
         * This field shall indicate the tariff price.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.2
         */
        price?: number | bigint;

        /**
         * This field shall indicate the tariff price level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.3
         */
        priceLevel?: number;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link CommodityTariff}.
     */
    export const Cluster: typeof CommodityTariff;

    /**
     * @deprecated Use {@link CommodityTariff}.
     */
    export const Complete: typeof CommodityTariff;

    export const Typing: CommodityTariff;
}

/**
 * @deprecated Use {@link CommodityTariff}.
 */
export declare const CommodityTariffCluster: typeof CommodityTariff;

export interface CommodityTariff extends ClusterTyping {
    Attributes: CommodityTariff.Attributes;
    Commands: CommodityTariff.Commands;
    Features: CommodityTariff.Features;
    Components: CommodityTariff.Components;
}
