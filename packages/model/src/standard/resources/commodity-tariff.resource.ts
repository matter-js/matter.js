/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "CommodityTariff", pics: "SETRF", xref: "cluster§9.12",
    details: "The CommodityTariffCluster provides the mechanism for communicating Commodity Tariff information " +
        "within the premises.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.12.4",

            children: [
                { tag: "field", name: "PRICE", details: "Supports information about commodity pricing" },
                {
                    tag: "field", name: "FCRED",
                    details: "Supports information about when friendly credit periods begin and end"
                },
                {
                    tag: "field", name: "AUXLD",
                    details: "Supports information about when auxiliary loads should be enabled or disabled"
                },
                { tag: "field", name: "PEAKP", details: "Supports information about peak periods" },
                { tag: "field", name: "PWRTHLD", details: "Supports information about power threshold" },
                {
                    tag: "field", name: "RNDM",
                    details: "Supports information about randomization of calendar day entries"
                }
            ]
        },

        {
            tag: "attribute", name: "TariffInfo", xref: "cluster§9.12.6.1",
            details: "Indicates basic information about the tariff." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "TariffUnit", xref: "cluster§9.12.6.2",
            details: "Indicates the unit of the commodity for pricing." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "StartDate", xref: "cluster§9.12.6.3",
            details: "Indicates a timestamp in UTC to denote the time at which the published calendar becomes active. A " +
                "start date/time of 0x00000000 shall indicate that the calendar should become active immediately." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "DayEntries", xref: "cluster§9.12.6.4",

            details: "Indicates the list of DayEntryStructs included in this calendar." +
                "\n" +
                "The maximum constraint of this attribute is intended to allow representation of seven days of tariff " +
                "information at 15 minute intervals." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "DayPatterns", xref: "cluster§9.12.6.5",
            details: "Indicates the list of DayPatternStructs used in the CalendarPeriodStruct in this calendar." +
                "\n" +
                "Each day pattern in this list shall define the specific schedule that applies to the days it covers."
        },

        {
            tag: "attribute", name: "CalendarPeriods", xref: "cluster§9.12.6.6",

            details: "Indicates the list of CalendarPeriodStructs comprising this calendar. The CalendarPeriodStructs in " +
                "this list shall be arranged in increasing order by the value of StartDate." +
                "\n" +
                "If and only if the value of the StartDate attribute is null, the value of the StartDate field on the " +
                "first CalendarPeriodStruct in the CalendarPeriods attribute shall also be null, indicating that the " +
                "period begins immediately. The value of the StartDate field on any subsequent CalendarPeriodStruct " +
                "in CalendarPeriods shall NOT be null." +
                "\n" +
                "The active calendar period shall be in effect until the StartDate of the next calendar period." +
                "\n" +
                "If the calendar is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "IndividualDays", xref: "cluster§9.12.6.7",

            details: "Indicates the list of days to overlay on this calendar." +
                "\n" +
                "The DayStruct in this list shall be arranged in increasing order by the value of Date. The DayStruct " +
                "in this list shall not overlap." +
                "\n" +
                "If the calendar is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "CurrentDay", xref: "cluster§9.12.6.8",
            details: "Indicates the current day's day entries." +
                "\n" +
                "If the tariff is not active or CurrentDay information is not available, this attribute shall be " +
                "null."
        },

        {
            tag: "attribute", name: "NextDay", xref: "cluster§9.12.6.9",
            details: "Indicates the next day's day entries." +
                "\n" +
                "If the tariff is not active or NextDay information is not available, this attribute shall be null."
        },

        {
            tag: "attribute", name: "CurrentDayEntry", xref: "cluster§9.12.6.10",
            details: "Indicates the currently active DayEntryStruct." +
                "\n" +
                "If the tariff is not active or day entry information is not available, this attribute shall be null."
        },

        {
            tag: "attribute", name: "CurrentDayEntryDate", xref: "cluster§9.12.6.11",
            details: "Indicates the UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents attributes " +
                "were last updated." +
                "\n" +
                "If the tariff is not active or day entry information is not available, this attribute shall be null."
        },

        {
            tag: "attribute", name: "NextDayEntry", xref: "cluster§9.12.6.12",
            details: "Indicates the predicted next active DayEntryStruct." +
                "\n" +
                "If the tariff is not active or is not available, this attribute shall be null."
        },

        {
            tag: "attribute", name: "NextDayEntryDate", xref: "cluster§9.12.6.13",
            details: "Indicates the predicted UTC date when the CurrentDay, CurrentDayEntry, and CurrentTariffComponents " +
                "attributes will update to the values in the NextDay, NextDayEntry, and NextTariffComponents " +
                "attributes, respectively." +
                "\n" +
                "If the tariff is not active or is not available, this attribute shall be null."
        },

        {
            tag: "attribute", name: "TariffComponents", xref: "cluster§9.12.6.14",
            details: "Indicates a list of TariffComponentStructs for the tariff." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be empty."
        },

        {
            tag: "attribute", name: "TariffPeriods", xref: "cluster§9.12.6.15",
            details: "Indicates a list of TariffPeriodStructs for the tariff." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be empty."
        },

        {
            tag: "attribute", name: "CurrentTariffComponents", xref: "cluster§9.12.6.16",
            details: "Indicates a list of the currently active TariffComponentStructs." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be empty."
        },

        {
            tag: "attribute", name: "NextTariffComponents", xref: "cluster§9.12.6.17",
            details: "Indicates the predicted next active TariffComponentStructs." +
                "\n" +
                "If the tariff is unavailable, this attribute shall be null."
        },

        {
            tag: "attribute", name: "DefaultRandomizationOffset", xref: "cluster§9.12.6.18",
            details: "Indicates a default randomization offset for DayEntryStructs in this tariff. See RandomizationOffset " +
                "for details."
        },
        {
            tag: "attribute", name: "DefaultRandomizationType", xref: "cluster§9.12.6.19",
            details: "Indicates a default randomization type for DayEntryStruct in this tariff. See RandomizationType for " +
                "details."
        },

        {
            tag: "command", name: "GetTariffComponent", xref: "cluster§9.12.7.1",
            details: "The GetTariffComponent command allows a client to request information for a tariff component " +
                "identifier that may no longer be available in the TariffPeriods attributes.",
            children: [{
                tag: "field", name: "TariffComponentId", xref: "cluster§9.12.7.1.1",
                details: "This field shall be used to indicate the TariffComponentID of the DayEntryStruct to be returned."
            }]
        },

        {
            tag: "command", name: "GetTariffComponentResponse", xref: "cluster§9.12.7.2",
            details: "The GetTariffComponentResponse command is sent in response to a GetTariffComponent command.",

            children: [
                {
                    tag: "field", name: "Label", xref: "cluster§9.12.7.2.1",
                    details: "A free-form label for the tariff period."
                },
                {
                    tag: "field", name: "DayEntryIDs", xref: "cluster§9.12.7.2.2",
                    details: "This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff " +
                        "component is active."
                },
                {
                    tag: "field", name: "TariffComponent", xref: "cluster§9.12.7.2.3",
                    details: "This field shall indicate the TariffComponentStruct whose TariffComponentID field matches the " +
                        "requested GetTariffComponentTariffComponentID."
                }
            ]
        },

        {
            tag: "command", name: "GetDayEntry", xref: "cluster§9.12.7.3",
            details: "The GetDayEntry command allows a client to request information for a calendar day entry identifier " +
                "that may no longer be available in the CalendarPeriods or IndividualDays attributes.",
            children: [{
                tag: "field", name: "DayEntryId", xref: "cluster§9.12.7.3.1",
                details: "This field shall be used to indicate the DayEntryID of the DayEntryStruct to be returned."
            }]
        },

        {
            tag: "command", name: "GetDayEntryResponse", xref: "cluster§9.12.7.4",
            details: "The GetDayEntryResponse command is sent in response to a GetDayEntry command."
        },

        {
            tag: "datatype", name: "DayPatternDayOfWeekBitmap", xref: "cluster§9.12.5.1",

            children: [
                { tag: "field", name: "Sunday", description: "Sunday" },
                { tag: "field", name: "Monday", description: "Monday" },
                { tag: "field", name: "Tuesday", description: "Tuesday" },
                { tag: "field", name: "Wednesday", description: "Wednesday" },
                { tag: "field", name: "Thursday", description: "Thursday" },
                { tag: "field", name: "Friday", description: "Friday" },
                { tag: "field", name: "Saturday", description: "Saturday" }
            ]
        },

        {
            tag: "datatype", name: "AuxiliaryLoadSettingEnum", xref: "cluster§9.12.5.2",
            details: "This enumeration shall indicated the required state of an auxiliary switch.",
            children: [
                { tag: "field", name: "Off", description: "The switch should be in the OFF state" },
                { tag: "field", name: "On", description: "The switch should be in the ON state" },
                { tag: "field", name: "None", description: "No state is required" }
            ]
        },

        {
            tag: "datatype", name: "DayTypeEnum", xref: "cluster§9.12.5.3",

            children: [
                { tag: "field", name: "Standard", description: "Standard" },
                { tag: "field", name: "Holiday", description: "Holiday" },
                { tag: "field", name: "Dynamic", description: "Dynamic Pricing" },
                { tag: "field", name: "Event", description: "Individual Events" }
            ]
        },

        {
            tag: "datatype", name: "PeakPeriodSeverityEnum", xref: "cluster§9.12.5.4",

            children: [
                { tag: "field", name: "Unused", description: "Unused" },
                { tag: "field", name: "Low", description: "Low" },
                { tag: "field", name: "Medium", description: "Medium" },
                { tag: "field", name: "High", description: "High" }
            ]
        },

        {
            tag: "datatype", name: "DayEntryRandomizationTypeEnum", xref: "cluster§9.12.5.5",

            children: [
                { tag: "field", name: "None", description: "No randomization applied" },
                { tag: "field", name: "Fixed", description: "An unchanging offset" },
                { tag: "field", name: "Random", description: "A random value" },
                { tag: "field", name: "RandomPositive", description: "A random positive value" },
                { tag: "field", name: "RandomNegative", description: "A random negative value" }
            ]
        },

        {
            tag: "datatype", name: "BlockModeEnum", xref: "cluster§9.12.5.6",

            children: [
                {
                    tag: "field", name: "NoBlock", description: "Tariff has no usage blocks",
                    xref: "cluster§9.12.5.6.1",
                    details: "This value shall indicate that the tariff has no usage blocks. All Threshold fields on " +
                        "TariffComponentStruct in a tariff whose BlockMode field is set to NoBlock shall be null."
                },

                {
                    tag: "field", name: "Combined", description: "Usage is metered in combined blocks",
                    xref: "cluster§9.12.5.6.2",
                    details: "This value shall indicate that all Threshold fields apply to combined usage across all " +
                        "TariffComponentStruct during the billing period."
                },

                {
                    tag: "field", name: "Individual", description: "Usage is metered separately by tariff component",
                    xref: "cluster§9.12.5.6.3",
                    details: "This value shall indicate that all Threshold fields apply only to usage during the active period of " +
                        "the associated TariffComponentStruct in the billing period."
                }
            ]
        },

        {
            tag: "datatype", name: "AuxiliaryLoadSwitchSettingsStruct", xref: "cluster§9.12.5.7",
            details: "This represents the settings for a given auxiliary load switch in a tariff component."
        },
        {
            tag: "datatype", name: "AuxiliaryLoadSwitchesSettingsStruct", xref: "cluster§9.12.5.8",
            details: "This represents the set of auxiliary load settings in a tariff component."
        },

        {
            tag: "datatype", name: "CalendarPeriodStruct", xref: "cluster§9.12.5.9",

            details: "This represents a sub period of a calendar, commencing on its StartDate." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: A 'Calendar Period', while normally considered to be a 3 or 6 month period, could be used " +
                "for other arbitrary periods e.g. monthly or quarterly. The minimum resolution is 1 day, although a " +
                "week would normally be the smallest interval.",

            children: [
                {
                    tag: "field", name: "StartDate", xref: "cluster§9.12.5.9.1",
                    details: "This field shall indicate the timestamp in UTC when the calendar period becomes active." +
                        "\n" +
                        "A null value shall indicate the calendar period becomes active immediately. See CalendarPeriods " +
                        "attribute."
                },

                {
                    tag: "field", name: "DayPatternIDs", xref: "cluster§9.12.5.9.2",

                    details: "This field shall indicate a list of DayPatternIDs for the DayPatternStructs in use during this " +
                        "calendar period." +
                        "\n" +
                        "If any of the DayPatternStructs referenced by this list has no bits set in DaysOfWeek, then none of " +
                        "the DayPatternStructs referenced by this list shall have any bits set, and the list shall be treated " +
                        "as a rotating set of days." +
                        "\n" +
                        "If at least one of the DayPatternStructs referenced by this list has a bit set in DaysOfWeek, then:" +
                        "\n" +
                        "  1. All of the DayPatternStructs referenced by this list shall have at least one bit set in " +
                        "DaysOfWeek" +
                        "\n" +
                        "  2. No two DayPatternStructs referenced by this list shall have the same bit set in DaysOfWeek." +
                        "\n" +
                        "  3. Every bit defined in DayPatternDayOfWeekBitmap referenced by this list shall be set in " +
                        "DaysOfWeek on one of the DayPatternStructs." +
                        "\n" +
                        "Meeting these constraints ensures that every day of the week during this week has specified day " +
                        "entries, and no day of the week has more than one set of day entries."
                }
            ]
        },

        {
            tag: "datatype", name: "DayEntryStruct", xref: "cluster§9.12.5.10",
            details: "This struct represents a day entry at a particular time of day, along with an optional duration and " +
                "randomization parameters.",

            children: [
                {
                    tag: "field", name: "DayEntryId", xref: "cluster§9.12.5.10.1",

                    details: "This field shall indicate an identifier for the day entry which is unique on the server to a set of " +
                        "values:" +
                        "\n" +
                        "  1. If this identifier is included in the DayEntryIDs associated with a DayPatternStruct, then the " +
                        "identifier shall be unique to the combination of:" +
                        "\n" +
                        "  1. the StartTime" +
                        "\n" +
                        "  2. the Duration, if indicated" +
                        "\n" +
                        "  3. the DaysOfWeek field in the containing DayPatternStruct" +
                        "\n" +
                        "  2. Otherwise, if this identifier is included in the DayEntryIDs associated with a DayStruct, then " +
                        "the identifier shall be unique to the combination of:" +
                        "\n" +
                        "  1. the StartTime" +
                        "\n" +
                        "  2. the Duration, if indicated" +
                        "\n" +
                        "  3. the Date field in the containing DayStruct" +
                        "\n" +
                        "Once an identifier has been used for a given combination above, it shall never be used for any other " +
                        "combination of these values."
                },

                {
                    tag: "field", name: "StartTime", xref: "cluster§9.12.5.10.2",

                    details: "This field shall indicate the start time of the DayEntryStruct, expressed as the number of minutes " +
                        "that have elapsed since midnight on the associated days." +
                        "\n" +
                        "For example, 6am will be represented by 360 minutes since midnight and 11:30pm will be represented " +
                        "by 1410 minutes since midnight." +
                        "\n" +
                        "This will differ on days with a day entry in or out of daylight saving time. For example, if the " +
                        "implementation of daylight saving time in a region means that the hour between 2am and 3am will be " +
                        "skipped on the day entry into daylight saving time, then 2am cannot be represented, and 3am will be " +
                        "represented by 120 minutes." +
                        "\n" +
                        "Similarly, if the implementation of daylight saving time in a region means that the hour between 2am " +
                        "and 3am will be repeated on the date of day entry out of daylight saving time, then the first 2am " +
                        "will be represented by 120 minutes, while the second 2am will be represented by 180 minutes, and 4am " +
                        "will be represented by 300 minutes. As such, the maximum start time on this day is 1499, 60 minutes " +
                        "longer than all other days." +
                        "\n" +
                        "DayEntryStruct on daylight saving time days SHOULD be handled by a DayStruct in the IndividualDays " +
                        "attribute whose Date field indicates the date of the day entry."
                },

                {
                    tag: "field", name: "Duration", xref: "cluster§9.12.5.10.3",

                    details: "This field shall indicate the duration of the day entry, expressed as the number of minutes since " +
                        "the time indicated by the StartTime field." +
                        "\n" +
                        "If this field is omitted, the day entry shall end at the StartTime of the DayEntryStruct identified " +
                        "by the next DayEntryID in the containing list. If the DayEntryStruct is the last item in the " +
                        "containing list, then the day entry shall last until the end of the day."
                },

                {
                    tag: "field", name: "RandomizationOffset", xref: "cluster§9.12.5.10.4",

                    details: "This field shall indicate a randomization offset for this particular day entry in seconds. If this " +
                        "field is not indicated, randomization shall use the value in the DefaultRandomizationOffset " +
                        "attribute." +
                        "\n" +
                        "  1. If the value of the RandomizationType field is Fixed, then the value of this field may be " +
                        "negative" +
                        "\n" +
                        "  2. Otherwise if the value of the RandomizationType field is RandomNegative, then the value of this " +
                        "field shall be less than or equal to zero" +
                        "\n" +
                        "  3. Otherwise the value of this field shall be greater than or equal to zero"
                },

                {
                    tag: "field", name: "RandomizationType", xref: "cluster§9.12.5.10.5",

                    details: "This field shall indicate a randomization type for this particular day entry. If this field is not " +
                        "indicated, randomization shall use the value in the DefaultRandomizationType attribute." +
                        "\n" +
                        "If the calculated value for this field is of type None, no randomization shall be applied to the " +
                        "start of this day entry." +
                        "\n" +
                        "If the calculated value for this field is of type Fixed, then the calculated value of the " +
                        "RandomizationOffset field shall be added to the start time of the day entry." +
                        "\n" +
                        "If the calculated value for this field is of type Random, then a random number of whole seconds " +
                        "whose absolute value is less than or equal to the calculated value of the RandomizationOffset field " +
                        "shall be added to the start time of the day entry." +
                        "\n" +
                        "If the calculated value for this field is of type RandomPositive, then a random non-negative number " +
                        "of whole seconds whose value is less than or equal to the calculated value of the " +
                        "RandomizationOffset field shall be added to the start time of the day entry." +
                        "\n" +
                        "If the calculated value for this field is of type RandomNegative, then a random negative number of " +
                        "whole seconds whose value is greater than or equal to the calculated value of the " +
                        "RandomizationOffset field shall be added to the start time of the day entry."
                }
            ]
        },

        {
            tag: "datatype", name: "DayStruct", xref: "cluster§9.12.5.11",
            details: "This represents a series of day entries over the course of a day for a specific date.",

            children: [
                {
                    tag: "field", name: "Date", xref: "cluster§9.12.5.11.1",
                    details: "This field shall indicate the date the associated set of DayEntryStructs applies to."
                },
                {
                    tag: "field", name: "DayType", xref: "cluster§9.12.5.11.2",
                    details: "This field shall indicate the type of day represented by the struct."
                },

                {
                    tag: "field", name: "DayEntryIDs", xref: "cluster§9.12.5.11.3",

                    details: "This field shall indicate a list of DayEntryIDs for the DayEntryStructs to apply during the date " +
                        "specified by Date, ordered by the value of the StartTime field." +
                        "\n" +
                        "This list shall NOT contain two DayEntryIDs for DayEntryStructs with the same value of the StartTime " +
                        "field." +
                        "\n" +
                        "If the Randomization feature is supported, every DayEntryStruct whose DayEntryID is included in this " +
                        "field shall have its StartTime field set to a value less than the following DayEntryStruct's " +
                        "StartTime field minus the calculated value of its RandomizationOffset field. In other words, it " +
                        "should not be possible for a random offset to cause a day entry to begin before the preceding day " +
                        "entry." +
                        "\n" +
                        "If the DayType field is not Event:" +
                        "\n" +
                        "  1. The DayEntryStruct referenced by the first DayEntryID in this list shall have its StartTime " +
                        "field set to zero." +
                        "\n" +
                        "  2. Every DayEntryStruct referenced by this list shall have its Duration field omitted." +
                        "\n" +
                        "Otherwise, if the DayType field is Event:" +
                        "\n" +
                        "  1. Every DayEntryStruct referenced by this list shall NOT have a Duration field whose value, added " +
                        "to the value of StartTime field, is greater than the value of StartTime field on any subsequent " +
                        "DayEntryStruct referenced by this list. In other words, day entries with a set duration can not " +
                        "overlap any other day entries."
                }
            ]
        },

        {
            tag: "datatype", name: "DayPatternStruct", xref: "cluster§9.12.5.12",
            details: "This represents a series of day entries over the course of a day for a given set of days of the " +
                "week.",

            children: [
                {
                    tag: "field", name: "DayPatternId", xref: "cluster§9.12.5.12.1",
                    details: "This field shall indicate an identifier for the day pattern. It shall be a unique identifier for the " +
                        "combination of values of the DaysOfWeek and DayEntryIDs fields." +
                        "\n" +
                        "Once an identifier has been used for this combination, it shall NOT be used to represent any other " +
                        "combination of these values."
                },

                {
                    tag: "field", name: "DaysOfWeek", xref: "cluster§9.12.5.12.2",
                    details: "This field shall indicate which days of the week the associated set of DayEntryStructs applies to. " +
                        "If no bits are set, then this shall be a rotating day. See DayPatternIDs."
                },

                {
                    tag: "field", name: "DayEntryIDs", xref: "cluster§9.12.5.12.3",
                    details: "This field shall indicate a list of DayEntryIDs for the DayEntryStructs to apply during the days " +
                        "specified by DaysOfWeek, ordered by StartTime." +
                        "\n" +
                        "This list shall NOT contain two DayEntryIDs for the DayEntryStructs with the same value of the " +
                        "StartTime field."
                }
            ]
        },

        {
            tag: "datatype", name: "PeakPeriodStruct", xref: "cluster§9.12.5.13",

            children: [
                {
                    tag: "field", name: "Severity", xref: "cluster§9.12.5.13.1",
                    details: "This field shall indicate the severity of the peak period."
                },
                {
                    tag: "field", name: "PeakPeriod", xref: "cluster§9.12.5.13.2",
                    details: "This field shall indicate the PeakPeriod number."
                }
            ]
        },

        {
            tag: "datatype", name: "TariffInformationStruct", xref: "cluster§9.12.5.14",
            details: "This represents particular Tariff Price information.",

            children: [
                {
                    tag: "field", name: "TariffLabel", xref: "cluster§9.12.5.14.1",
                    details: "This field shall indicate a label for the tariff."
                },
                {
                    tag: "field", name: "ProviderName", xref: "cluster§9.12.5.14.2",
                    details: "This field shall indicate the name of the commodity provider for this tariff."
                },
                {
                    tag: "field", name: "Currency", xref: "cluster§9.12.5.14.3",
                    details: "This field shall indicate the currency for the value of the Price field on all TariffPriceStruct."
                },
                {
                    tag: "field", name: "BlockMode", xref: "cluster§9.12.5.14.4",
                    details: "This field shall indicate the mode for metering blocks of usage."
                }
            ]
        },

        {
            tag: "datatype", name: "TariffPriceStruct", xref: "cluster§9.12.5.15",
            details: "This indicates a price or price level for a given tariff component, as well as what type of pricing " +
                "it represents",

            children: [
                {
                    tag: "field", name: "PriceType", xref: "cluster§9.12.5.15.1",
                    details: "This field shall indicate the type of price for the Price or PriceLevel fields."
                },
                {
                    tag: "field", name: "Price", xref: "cluster§9.12.5.15.2",
                    details: "This field shall indicate the tariff price."
                },
                {
                    tag: "field", name: "PriceLevel", xref: "cluster§9.12.5.15.3",
                    details: "This field shall indicate the tariff price level."
                }
            ]
        },

        {
            tag: "datatype", name: "TariffComponentStruct", xref: "cluster§9.12.5.16",
            details: "This represents components of a tariff." +
                "\n" +
                "Tariff components typically represent a price or price level, though they may also specify other " +
                "aspects of a tariff. For example, a tariff component may indicate changes in power thresholds, " +
                "friendly credit status, or the expected state of auxiliary switches.",

            children: [
                {
                    tag: "field", name: "TariffComponentId", xref: "cluster§9.12.5.16.1",

                    details: "This field shall indicate an identifier for the tariff component. If the tariff component is not a " +
                        "prediction, this field shall be a unique identifier for the combination of values of the Price, " +
                        "Threshold, FriendlyCredit, AuxiliaryLoad, and PeakPeriod fields with the value of the DayEntryIDs " +
                        "field on the encompassing TariffPeriodStruct." +
                        "\n" +
                        "Once an identifier has been used for this combination, it shall NOT be used to represent any other " +
                        "combination of these values."
                },

                {
                    tag: "field", name: "Price", xref: "cluster§9.12.5.16.2",

                    details: "This field shall indicate the price when the tariff component is active." +
                        "\n" +
                        "When the Predicted field is set to TRUE, a null value shall indicate that the price and/or price " +
                        "level is not yet available." +
                        "\n" +
                        "When the Predicted field is set to FALSE, a null value shall indicate that the server is unable to " +
                        "provide a specific price or price level."
                },

                {
                    tag: "field", name: "FriendlyCredit", xref: "cluster§9.12.5.16.3",

                    details: "This field shall indicate whether the calendar is entering a friendly credit period or not." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> NOTE: When a meter enters into a Friendly Credit Period with a usable positive credit balance, the " +
                        "consumer will be allowed to consume energy for the duration of the Friendly Credit Period, " +
                        "regardless of their credit status while in that period. If, however, the consumer had already run " +
                        "out of credit and supply was interrupted before entering into the Friendly Credit Period, they " +
                        "will not be allowed to reconnect without first adding suitable additional credit." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> NOTE: At the end of the Friendly Credit Period, the normal delivery rules connected with the " +
                        "accounting functions of the meter will be resumed, and if the meter’s credit balance has dropped " +
                        "below the disablement threshold during the Friendly Credit Period, then the meter will disconnect " +
                        "upon resuming normal delivery rules"
                },

                {
                    tag: "field", name: "AuxiliaryLoad", xref: "cluster§9.12.5.16.4",
                    details: "This field shall indicate the required state of auxiliary load switches."
                },
                {
                    tag: "field", name: "PeakPeriod", xref: "cluster§9.12.5.16.5",
                    details: "This field shall indicate whether the tariff component represents a peak period."
                },
                {
                    tag: "field", name: "PowerThreshold", xref: "cluster§9.12.5.16.6",
                    details: "This field shall indicate whether the tariff component represents a power threshold."
                },

                {
                    tag: "field", name: "Threshold", xref: "cluster§9.12.5.16.7",
                    details: "This field shall indicate the maximum level of consumption this tariff component applies to, in " +
                        "units specified by the TariffUnit attribute. If the tariff component applies to any level of " +
                        "consumption, this field shall be null."
                },

                {
                    tag: "field", name: "Label", xref: "cluster§9.12.5.16.8",
                    details: "A free-form label for the tariff component."
                },
                {
                    tag: "field", name: "Predicted", xref: "cluster§9.12.5.16.9",
                    details: "This field shall indicate whether the tariff component represents a price prediction."
                }
            ]
        },

        {
            tag: "datatype", name: "TariffPeriodStruct", xref: "cluster§9.12.5.17",
            details: "This represents the tariff components in effect for a set of calendar day entry IDs.",

            children: [
                {
                    tag: "field", name: "Label", xref: "cluster§9.12.5.17.1",
                    details: "A free-form label for the tariff period."
                },

                {
                    tag: "field", name: "DayEntryIDs", xref: "cluster§9.12.5.17.2",
                    details: "This field shall indicate a list of DayEntryIDs for the DayEntryStructs during which the tariff " +
                        "components are active." +
                        "\n" +
                        "Each DayEntryID shall be included in at most one DayEntryIDs field. In other words, there shall be " +
                        "only one TariffPeriodStruct for each DayEntryID."
                },

                {
                    tag: "field", name: "TariffComponentIDs", xref: "cluster§9.12.5.17.3",
                    details: "This field shall indicate a list of TariffComponentIDs for the TariffComponentStructs active during " +
                        "the specified day entries."
                }
            ]
        }
    ]
});
