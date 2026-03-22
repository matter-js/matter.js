/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command } from "../cluster/Cluster.js";
import { TlvInt16, TlvEnum, TlvEpochS, TlvUInt32, TlvUInt16, TlvUInt8, TlvBitmap, TlvInt64 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvCurrency } from "../globals/Currency.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TariffUnit } from "../globals/TariffUnit.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TariffPriceType } from "../globals/TariffPriceType.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvPowerThreshold } from "../globals/PowerThreshold.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CommodityTariff {
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
     * This represents particular Tariff Price information.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14
     */
    export const TlvTariffInformation = TlvObject({
        /**
         * This field shall indicate a label for the tariff.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.1
         */
        tariffLabel: TlvField(0, TlvNullable(TlvString.bound({ maxLength: 128 }))),

        /**
         * This field shall indicate the name of the commodity provider for this tariff.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.2
         */
        providerName: TlvField(1, TlvNullable(TlvString.bound({ maxLength: 128 }))),

        /**
         * This field shall indicate the currency for the value of the Price field on all TariffPriceStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.3
         */
        currency: TlvOptionalField(2, TlvNullable(TlvCurrency)),

        /**
         * This field shall indicate the mode for metering blocks of usage.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14.4
         */
        blockMode: TlvField(3, TlvNullable(TlvEnum<BlockMode>()))
    });

    /**
     * This represents particular Tariff Price information.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.14
     */
    export interface TariffInformation extends TypeFromSchema<typeof TlvTariffInformation> {}

    /**
     * This struct represents a day entry at a particular time of day, along with an optional duration and randomization
     * parameters.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10
     */
    export const TlvDayEntry = TlvObject({
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
        dayEntryId: TlvField(0, TlvUInt32),

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
        startTime: TlvField(1, TlvUInt16.bound({ max: 1499 })),

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
        duration: TlvOptionalField(2, TlvUInt16),

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
        randomizationOffset: TlvOptionalField(3, TlvInt16),

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
        randomizationType: TlvOptionalField(4, TlvEnum<DayEntryRandomizationType>())
    });

    /**
     * This struct represents a day entry at a particular time of day, along with an optional duration and randomization
     * parameters.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.10
     */
    export interface DayEntry extends TypeFromSchema<typeof TlvDayEntry> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.1
     */
    export const DayPatternDayOfWeek = {
        /**
         * Sunday
         */
        sunday: BitFlag(0),

        /**
         * Monday
         */
        monday: BitFlag(1),

        /**
         * Tuesday
         */
        tuesday: BitFlag(2),

        /**
         * Wednesday
         */
        wednesday: BitFlag(3),

        /**
         * Thursday
         */
        thursday: BitFlag(4),

        /**
         * Friday
         */
        friday: BitFlag(5),

        /**
         * Saturday
         */
        saturday: BitFlag(6)
    };

    /**
     * This represents a series of day entries over the course of a day for a given set of days of the week.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12
     */
    export const TlvDayPattern = TlvObject({
        /**
         * This field shall indicate an identifier for the day pattern. It shall be a unique identifier for the
         * combination of values of the DaysOfWeek and DayEntryIDs fields.
         *
         * Once an identifier has been used for this combination, it shall NOT be used to represent any other
         * combination of these values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.1
         */
        dayPatternId: TlvField(0, TlvUInt32),

        /**
         * This field shall indicate which days of the week the associated set of DayEntryStructs applies to. If no bits
         * are set, then this shall be a rotating day. See DayPatternIDs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.2
         */
        daysOfWeek: TlvField(1, TlvBitmap(TlvUInt8, DayPatternDayOfWeek)),

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs to apply during the days specified by
         * DaysOfWeek, ordered by StartTime.
         *
         * This list shall NOT contain two DayEntryIDs for the DayEntryStructs with the same value of the StartTime
         * field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12.3
         */
        dayEntryIDs: TlvField(2, TlvArray(TlvUInt32, { minLength: 1, maxLength: 96 }))
    });

    /**
     * This represents a series of day entries over the course of a day for a given set of days of the week.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.12
     */
    export interface DayPattern extends TypeFromSchema<typeof TlvDayPattern> {}

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
    export const TlvCalendarPeriod = TlvObject({
        /**
         * This field shall indicate the timestamp in UTC when the calendar period becomes active.
         *
         * A null value shall indicate the calendar period becomes active immediately. See CalendarPeriods attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.9.1
         */
        startDate: TlvField(0, TlvNullable(TlvEpochS)),

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
        dayPatternIDs: TlvField(1, TlvArray(TlvUInt32, { minLength: 1, maxLength: 7 }))
    });

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
    export interface CalendarPeriod extends TypeFromSchema<typeof TlvCalendarPeriod> {}

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
     * This represents a series of day entries over the course of a day for a specific date.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11
     */
    export const TlvDay = TlvObject({
        /**
         * This field shall indicate the date the associated set of DayEntryStructs applies to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11.1
         */
        date: TlvField(0, TlvEpochS),

        /**
         * This field shall indicate the type of day represented by the struct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11.2
         */
        dayType: TlvField(1, TlvEnum<DayType>()),

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
        dayEntryIDs: TlvField(2, TlvArray(TlvUInt32, { minLength: 1, maxLength: 96 }))
    });

    /**
     * This represents a series of day entries over the course of a day for a specific date.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.11
     */
    export interface Day extends TypeFromSchema<typeof TlvDay> {}

    /**
     * This indicates a price or price level for a given tariff component, as well as what type of pricing it represents
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15
     */
    export const TlvTariffPrice = TlvObject({
        /**
         * This field shall indicate the type of price for the Price or PriceLevel fields.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.1
         */
        priceType: TlvField(0, TlvEnum<TariffPriceType>()),

        /**
         * This field shall indicate the tariff price.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.2
         */
        price: TlvOptionalField(1, TlvInt64),

        /**
         * This field shall indicate the tariff price level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15.3
         */
        priceLevel: TlvOptionalField(2, TlvInt16)
    });

    /**
     * This indicates a price or price level for a given tariff component, as well as what type of pricing it represents
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.15
     */
    export interface TariffPrice extends TypeFromSchema<typeof TlvTariffPrice> {}

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
     * This represents the settings for a given auxiliary load switch in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.7
     */
    export const TlvAuxiliaryLoadSwitchSettings = TlvObject({
        number: TlvField(0, TlvUInt8),
        requiredState: TlvField(1, TlvEnum<AuxiliaryLoadSetting>())
    });

    /**
     * This represents the settings for a given auxiliary load switch in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.7
     */
    export interface AuxiliaryLoadSwitchSettings extends TypeFromSchema<typeof TlvAuxiliaryLoadSwitchSettings> {}

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
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13
     */
    export const TlvPeakPeriod = TlvObject({
        /**
         * This field shall indicate the severity of the peak period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13.1
         */
        severity: TlvField(0, TlvEnum<PeakPeriodSeverity>()),

        /**
         * This field shall indicate the PeakPeriod number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13.2
         */
        peakPeriod: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.13
     */
    export interface PeakPeriod extends TypeFromSchema<typeof TlvPeakPeriod> {}

    /**
     * This represents components of a tariff.
     *
     * Tariff components typically represent a price or price level, though they may also specify other aspects of a
     * tariff. For example, a tariff component may indicate changes in power thresholds, friendly credit status, or the
     * expected state of auxiliary switches.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16
     */
    export const TlvTariffComponent = TlvObject({
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
        tariffComponentId: TlvField(0, TlvUInt32),

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
        price: TlvOptionalField(1, TlvNullable(TlvTariffPrice)),

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
        friendlyCredit: TlvOptionalField(2, TlvBoolean),

        /**
         * This field shall indicate the required state of auxiliary load switches.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.4
         */
        auxiliaryLoad: TlvOptionalField(3, TlvAuxiliaryLoadSwitchSettings),

        /**
         * This field shall indicate whether the tariff component represents a peak period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.5
         */
        peakPeriod: TlvOptionalField(4, TlvPeakPeriod),

        /**
         * This field shall indicate whether the tariff component represents a power threshold.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.6
         */
        powerThreshold: TlvOptionalField(5, TlvPowerThreshold),

        /**
         * This field shall indicate the maximum level of consumption this tariff component applies to, in units
         * specified by the TariffUnit attribute. If the tariff component applies to any level of consumption, this
         * field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.7
         */
        threshold: TlvField(6, TlvNullable(TlvInt64)),

        /**
         * A free-form label for the tariff component.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.8
         */
        label: TlvOptionalField(7, TlvNullable(TlvString.bound({ maxLength: 128 }))),

        /**
         * This field shall indicate whether the tariff component represents a price prediction.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16.9
         */
        predicted: TlvOptionalField(8, TlvBoolean)
    });

    /**
     * This represents components of a tariff.
     *
     * Tariff components typically represent a price or price level, though they may also specify other aspects of a
     * tariff. For example, a tariff component may indicate changes in power thresholds, friendly credit status, or the
     * expected state of auxiliary switches.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.16
     */
    export interface TariffComponent extends TypeFromSchema<typeof TlvTariffComponent> {}

    /**
     * This represents the tariff components in effect for a set of calendar day entry IDs.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17
     */
    export const TlvTariffPeriod = TlvObject({
        /**
         * A free-form label for the tariff period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.1
         */
        label: TlvField(0, TlvNullable(TlvString.bound({ maxLength: 128 }))),

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff components
         * are active.
         *
         * Each DayEntryID shall be included in at most one DayEntryIDs field. In other words, there shall be only one
         * TariffPeriodStruct for each DayEntryID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.2
         */
        dayEntryIDs: TlvField(1, TlvArray(TlvUInt32, { minLength: 1, maxLength: 20 })),

        /**
         * This field shall indicate a list of TariffComponentIDs for the TariffComponentStructs active during the
         * specified day entries.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17.3
         */
        tariffComponentIDs: TlvField(2, TlvArray(TlvUInt32, { minLength: 1, maxLength: 20 }))
    });

    /**
     * This represents the tariff components in effect for a set of calendar day entry IDs.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.17
     */
    export interface TariffPeriod extends TypeFromSchema<typeof TlvTariffPeriod> {}

    /**
     * Input to the CommodityTariff getTariffComponent command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
     */
    export const TlvGetTariffComponentRequest = TlvObject({
        /**
         * This field shall be used to indicate the TariffComponentID of the DayEntryStruct to be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1.1
         */
        tariffComponentId: TlvField(0, TlvUInt32)
    });

    /**
     * Input to the CommodityTariff getTariffComponent command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
     */
    export interface GetTariffComponentRequest extends TypeFromSchema<typeof TlvGetTariffComponentRequest> {}

    /**
     * The GetTariffComponentResponse command is sent in response to a GetTariffComponent command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2
     */
    export const TlvGetTariffComponentResponse = TlvObject({
        /**
         * A free-form label for the tariff period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.1
         */
        label: TlvField(0, TlvNullable(TlvString.bound({ maxLength: 128 }))),

        /**
         * This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff component is
         * active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.2
         */
        dayEntryIDs: TlvField(1, TlvArray(TlvUInt32, { minLength: 1, maxLength: 96 })),

        /**
         * This field shall indicate the TariffComponentStruct whose TariffComponentID field matches the requested
         * GetTariffComponentTariffComponentID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2.3
         */
        tariffComponent: TlvField(2, TlvTariffComponent)
    });

    /**
     * The GetTariffComponentResponse command is sent in response to a GetTariffComponent command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.2
     */
    export interface GetTariffComponentResponse extends TypeFromSchema<typeof TlvGetTariffComponentResponse> {}

    /**
     * Input to the CommodityTariff getDayEntry command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
     */
    export const TlvGetDayEntryRequest = TlvObject({
        /**
         * This field shall be used to indicate the DayEntryID of the DayEntryStruct to be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3.1
         */
        dayEntryId: TlvField(0, TlvUInt32)
    });

    /**
     * Input to the CommodityTariff getDayEntry command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
     */
    export interface GetDayEntryRequest extends TypeFromSchema<typeof TlvGetDayEntryRequest> {}

    /**
     * The GetDayEntryResponse command is sent in response to a GetDayEntry command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.4
     */
    export const TlvGetDayEntryResponse = TlvObject({ dayEntry: TlvField(0, TlvDayEntry) });

    /**
     * The GetDayEntryResponse command is sent in response to a GetDayEntry command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.4
     */
    export interface GetDayEntryResponse extends TypeFromSchema<typeof TlvGetDayEntryResponse> {}

    /**
     * This represents the set of auxiliary load settings in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.8
     */
    export const TlvAuxiliaryLoadSwitchesSettings = TlvObject({
        switchStates: TlvField(0, TlvArray(TlvAuxiliaryLoadSwitchSettings, { maxLength: 8 }))
    });

    /**
     * This represents the set of auxiliary load settings in a tariff component.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12.5.8
     */
    export interface AuxiliaryLoadSwitchesSettings extends TypeFromSchema<typeof TlvAuxiliaryLoadSwitchesSettings> {}

    /**
     * A CommodityTariffCluster supports these elements if it supports feature Randomization.
     */
    export const RandomizationComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates a default randomization offset for DayEntryStructs in this tariff. See RandomizationOffset for
             * details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.18
             */
            defaultRandomizationOffset: Attribute(0x11, TlvNullable(TlvInt16)),

            /**
             * Indicates a default randomization type for DayEntryStruct in this tariff. See RandomizationType for
             * details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.19
             */
            defaultRandomizationType: Attribute(0x12, TlvNullable(TlvEnum<DayEntryRandomizationType>()))
        }
    });

    /**
     * These elements and properties are present in all CommodityTariff clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x700,
        name: "CommodityTariff",
        revision: 1,

        features: {
            /**
             * Supports information about commodity pricing
             */
            pricing: BitFlag(0),

            /**
             * Supports information about when friendly credit periods begin and end
             */
            friendlyCredit: BitFlag(1),

            /**
             * Supports information about when auxiliary loads should be enabled or disabled
             */
            auxiliaryLoad: BitFlag(2),

            /**
             * Supports information about peak periods
             */
            peakPeriod: BitFlag(3),

            /**
             * Supports information about power threshold
             */
            powerThreshold: BitFlag(4),

            /**
             * Supports information about randomization of calendar day entries
             */
            randomization: BitFlag(5)
        },

        attributes: {
            /**
             * Indicates basic information about the tariff.
             *
             * If the tariff is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.1
             */
            tariffInfo: Attribute(0x0, TlvNullable(TlvTariffInformation)),

            /**
             * Indicates the unit of the commodity for pricing.
             *
             * If the tariff is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.2
             */
            tariffUnit: Attribute(0x1, TlvNullable(TlvEnum<TariffUnit>())),

            /**
             * Indicates a timestamp in UTC to denote the time at which the published calendar becomes active. A start
             * date/time of 0x00000000 shall indicate that the calendar should become active immediately.
             *
             * If the tariff is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.3
             */
            startDate: Attribute(0x2, TlvNullable(TlvEpochS)),

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
            dayEntries: Attribute(0x3, TlvNullable(TlvArray(TlvDayEntry, { maxLength: 672 }))),

            /**
             * Indicates the list of DayPatternStructs used in the CalendarPeriodStruct in this calendar.
             *
             * Each day pattern in this list shall define the specific schedule that applies to the days it covers.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.5
             */
            dayPatterns: Attribute(0x4, TlvNullable(TlvArray(TlvDayPattern, { maxLength: 28 }))),

            /**
             * Indicates the list of CalendarPeriodStructs comprising this calendar. The CalendarPeriodStructs in this
             * list shall be arranged in increasing order by the value of StartDate.
             *
             * If and only if the value of the StartDate attribute is null, the value of the StartDate field on the
             * first CalendarPeriodStruct in the CalendarPeriods attribute shall also be null, indicating that the
             * period begins immediately. The value of the StartDate field on any subsequent CalendarPeriodStruct in
             * CalendarPeriods shall NOT be null.
             *
             * The active calendar period shall be in effect until the StartDate of the next calendar period.
             *
             * If the calendar is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.6
             */
            calendarPeriods: Attribute(0x5, TlvNullable(TlvArray(TlvCalendarPeriod, { minLength: 1, maxLength: 4 }))),

            /**
             * Indicates the list of days to overlay on this calendar.
             *
             * The DayStruct in this list shall be arranged in increasing order by the value of Date. The DayStruct in
             * this list shall not overlap.
             *
             * If the calendar is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.7
             */
            individualDays: Attribute(0x6, TlvNullable(TlvArray(TlvDay, { maxLength: 50 }))),

            /**
             * Indicates the current day’s day entries.
             *
             * If the tariff is not active or CurrentDay information is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.8
             */
            currentDay: Attribute(0x7, TlvNullable(TlvDay)),

            /**
             * Indicates the next day’s day entries.
             *
             * If the tariff is not active or NextDay information is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.9
             */
            nextDay: Attribute(0x8, TlvNullable(TlvDay)),

            /**
             * Indicates the currently active DayEntryStruct.
             *
             * If the tariff is not active or day entry information is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.10
             */
            currentDayEntry: Attribute(0x9, TlvNullable(TlvDayEntry)),

            /**
             * Indicates the UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes were
             * last updated.
             *
             * If the tariff is not active or day entry information is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.11
             */
            currentDayEntryDate: Attribute(0xa, TlvNullable(TlvEpochS)),

            /**
             * Indicates the predicted next active DayEntryStruct.
             *
             * If the tariff is not active or is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.12
             */
            nextDayEntry: Attribute(0xb, TlvNullable(TlvDayEntry)),

            /**
             * Indicates the predicted UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents
             * attributes will update to the values in the NextDay, NextDayEntry, and NextTariffComponents attributes,
             * respectively.
             *
             * If the tariff is not active or is not available, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.13
             */
            nextDayEntryDate: Attribute(0xc, TlvNullable(TlvEpochS)),

            /**
             * Indicates a list of TariffComponentStructs for the tariff.
             *
             * If the tariff is unavailable, this attribute shall be empty.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.14
             */
            tariffComponents: Attribute(
                0xd,
                TlvNullable(TlvArray(TlvTariffComponent, { minLength: 1, maxLength: 672 }))
            ),

            /**
             * Indicates a list of TariffPeriodStructs for the tariff.
             *
             * If the tariff is unavailable, this attribute shall be empty.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.15
             */
            tariffPeriods: Attribute(0xe, TlvNullable(TlvArray(TlvTariffPeriod, { minLength: 1, maxLength: 672 }))),

            /**
             * Indicates a list of the currently active TariffComponentStructs.
             *
             * If the tariff is unavailable, this attribute shall be empty.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.16
             */
            currentTariffComponents: Attribute(0xf, TlvNullable(TlvArray(TlvTariffComponent, { maxLength: 20 }))),

            /**
             * Indicates the predicted next active TariffComponentStructs.
             *
             * If the tariff is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.6.17
             */
            nextTariffComponents: Attribute(0x10, TlvNullable(TlvArray(TlvTariffComponent, { maxLength: 20 })))
        },

        commands: {
            /**
             * The GetTariffComponent command allows a client to request information for a tariff component identifier
             * that may no longer be available in the TariffPeriods attributes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.1
             */
            getTariffComponent: Command(0x0, TlvGetTariffComponentRequest, 0x0, TlvGetTariffComponentResponse),

            /**
             * The GetDayEntry command allows a client to request information for a calendar day entry identifier that
             * may no longer be available in the CalendarPeriods or IndividualDays attributes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.12.7.3
             */
            getDayEntry: Command(0x1, TlvGetDayEntryRequest, 0x1, TlvGetDayEntryResponse)
        },

        /**
         * This metadata controls which CommodityTariffCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { randomization: true }, component: RandomizationComponent },
            { flags: { pricing: false, friendlyCredit: false, auxiliaryLoad: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * The CommodityTariffCluster provides the mechanism for communicating Commodity Tariff information within the
     * premises.
     *
     * Per the Matter specification you cannot use {@link CommodityTariffCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.12
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const RNDM = { randomization: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            defaultRandomizationOffset: MutableCluster.AsConditional(
                RandomizationComponent.attributes.defaultRandomizationOffset,
                { mandatoryIf: [RNDM] }
            ),
            defaultRandomizationType: MutableCluster.AsConditional(
                RandomizationComponent.attributes.defaultRandomizationType,
                { mandatoryIf: [RNDM] }
            )
        },

        commands: Base.commands
    });

    /**
     * This cluster supports all CommodityTariff features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type CommodityTariffCluster = CommodityTariff.Cluster;
export const CommodityTariffCluster = CommodityTariff.Cluster;
ClusterRegistry.register(CommodityTariff.Complete);
