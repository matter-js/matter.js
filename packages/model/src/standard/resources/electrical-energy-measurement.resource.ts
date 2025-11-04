/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ElectricalEnergyMeasurement", pics: "EEM", xref: "cluster§2.12",
    details: "This cluster provides a mechanism for querying data about the electrical energy imported or provided " +
        "by the server.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.12.4",

            children: [
                {
                    tag: "field", name: "IMPE", xref: "cluster§2.12.4.1",
                    details: "The feature indicates the server is capable of measuring how much energy is imported by the server."
                },
                {
                    tag: "field", name: "EXPE", xref: "cluster§2.12.4.2",
                    details: "The feature indicates the server is capable of measuring how much energy is exported by the server."
                },

                {
                    tag: "field", name: "CUME", xref: "cluster§2.12.4.3",
                    details: "The feature indicates the server is capable of measuring how much energy has been imported or " +
                        "exported by the server over the device’s lifetime. This measurement may start from when a device’s " +
                        "firmware is updated to include this feature, when a device’s firmware is updated to correct " +
                        "measurement errors, or when a device is factory reset."
                },

                {
                    tag: "field", name: "PERE", xref: "cluster§2.12.4.4",
                    details: "The feature indicates the server is capable of measuring how much energy has been imported or " +
                        "exported by the server during a certain period of time. The start and end times for measurement " +
                        "periods shall be determined by the server, and may represent overlapping periods."
                }
            ]
        },

        {
            tag: "attribute", name: "Accuracy", xref: "cluster§2.12.6.1",
            details: "Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field " +
                "on this MeasurementAccuracyStruct shall be ElectricalEnergy."
        },

        {
            tag: "attribute", name: "CumulativeEnergyImported", xref: "cluster§2.12.6.2",

            details: "Indicates the most recent measurement of cumulative energy imported by the server over the lifetime " +
                "of the device, and the timestamp of when the measurement was recorded." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds." +
                "\n" +
                "If the cumulative energy imported cannot currently be determined, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "CumulativeEnergyExported", xref: "cluster§2.12.6.3",

            details: "Indicates the most recent measurement of cumulative energy exported by the server over the lifetime " +
                "of the device, and the timestamp of when the measurement was recorded." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds." +
                "\n" +
                "If the cumulative energy exported cannot currently be determined, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "PeriodicEnergyImported", xref: "cluster§2.12.6.4",

            details: "Indicates the most recent measurement of energy imported by the server and the period during which " +
                "it was measured." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds." +
                "\n" +
                "If the periodic energy imported cannot currently be determined, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "PeriodicEnergyExported", xref: "cluster§2.12.6.5",

            details: "Indicates the most recent measurement of energy exported by the server and the period during which " +
                "it was measured." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds." +
                "\n" +
                "If the periodic energy exported cannot currently be determined, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "CumulativeEnergyReset", xref: "cluster§2.12.6.6",
            details: "Indicates when cumulative measurements were most recently zero."
        },

        {
            tag: "event", name: "CumulativeEnergyMeasured", xref: "cluster§2.12.7.1",
            details: "This event shall be generated when the server takes a snapshot of the cumulative energy imported by " +
                "the server, exported from the server, or both, but not more frequently than the rate mentioned in " +
                "the description above of the related attribute.",

            children: [
                {
                    tag: "field", name: "EnergyImported", xref: "cluster§2.12.7.1.1",
                    details: "This field shall be the value of CumulativeEnergyImported attribute at the timestamp indicated in " +
                        "its EndTimestamp field, EndSystime field, or both."
                },
                {
                    tag: "field", name: "EnergyExported", xref: "cluster§2.12.7.1.2",
                    details: "This field shall be the value of CumulativeEnergyExported attribute at the timestamp indicated in " +
                        "its EndTimestamp field, EndSystime field, or both."
                }
            ]
        },

        {
            tag: "event", name: "PeriodicEnergyMeasured", xref: "cluster§2.12.7.2",
            details: "This event shall be generated when the server reaches the end of a reporting period for imported " +
                "energy, exported energy, or both.",

            children: [
                {
                    tag: "field", name: "EnergyImported", xref: "cluster§2.12.7.2.1",
                    details: "This field shall be the value of PeriodicEnergyImported attribute at the timestamp indicated in its " +
                        "EndTimestamp field, EndSystime field, or both."
                },
                {
                    tag: "field", name: "EnergyExported", xref: "cluster§2.12.7.2.2",
                    details: "This field shall be the value of PeriodicEnergyExported attribute at the timestamp indicated in its " +
                        "EndTimestamp field, EndSystime field, or both."
                }
            ]
        },

        {
            tag: "datatype", name: "MeasurementTypeEnum", xref: "cluster§2.12.5.1",

            children: [
                { tag: "field", name: "Voltage", description: "Voltage in millivolts (mV)" },
                { tag: "field", name: "ActiveCurrent", description: "Active current in milliamps (mA)" },
                { tag: "field", name: "ReactiveCurrent", description: "Reactive current in milliamps (mA)" },
                { tag: "field", name: "ApparentCurrent", description: "Apparent current in milliamps (mA)" },
                { tag: "field", name: "ActivePower", description: "Active power in milliwatts (mW)" },
                {
                    tag: "field", name: "ReactivePower",
                    description: "Reactive power in millivolt-amps reactive (mVAR)"
                },
                { tag: "field", name: "ApparentPower", description: "Apparent power in millivolt-amps (mVA)" },
                { tag: "field", name: "RmsVoltage", description: "Root mean squared voltage in millivolts (mV)" },
                { tag: "field", name: "RmsCurrent", description: "Root mean squared current in milliamps (mA)" },
                { tag: "field", name: "RmsPower", description: "Root mean squared power in milliwatts (mW)" },
                { tag: "field", name: "Frequency", description: "AC frequency in millihertz (mHz)" },
                { tag: "field", name: "PowerFactor", description: "Power Factor ratio in+/- 1/100ths of a percent." },
                { tag: "field", name: "NeutralCurrent", description: "AC neutral current in milliamps (mA)" },
                { tag: "field", name: "ElectricalEnergy", description: "Electrical energy in milliwatt-hours (mWh)" },
                {
                    tag: "field", name: "ReactiveEnergy",
                    description: "Reactive power in millivolt-amp-hours reactive (mVARh)"
                },
                { tag: "field", name: "ApparentEnergy", description: "Apparent power in millivolt-amp-hours (mVAh)" }
            ]
        },

        {
            tag: "datatype", name: "EnergyMeasurementStruct", xref: "cluster§2.12.5.2",

            details: "This struct shall indicate the amount of energy measured during a given measurement period." +
                "\n" +
                "A server which does not have the ability to determine the time in UTC, or has not yet done so, shall " +
                "use the system time fields to specify the measurement period and observation times." +
                "\n" +
                "A server which has determined the time in UTC shall use the timestamp fields to specify the " +
                "measurement period. Such a server may also include the systime fields to indicate how many seconds " +
                "had passed since boot for a given timestamp; this allows for client-side resolution of UTC time for " +
                "previous reports that only included systime." +
                "\n" +
                "Elements using this data type shall indicate whether it represents cumulative or periodic energy, " +
                "e.g. in the name or in the element description.",

            children: [
                {
                    tag: "field", name: "Energy", xref: "cluster§2.12.5.2.1",

                    details: "This field shall be the reported energy." +
                        "\n" +
                        "If the EnergyMeasurementStruct represents cumulative energy, then this shall represent the " +
                        "cumulative energy recorded at either the value of the EndTimestamp field or the value of the " +
                        "EndSystime field, or both." +
                        "\n" +
                        "If the EnergyMeasurementStruct represents periodic energy, then this shall represent the energy " +
                        "recorded during the period specified by either the StartTimestamp and EndTimestamp fields, the " +
                        "period specified by the StartSystime and EndSystime fields, or both."
                },

                {
                    tag: "field", name: "StartTimestamp", xref: "cluster§2.12.5.2.2",

                    details: "This field shall indicate the timestamp in UTC of the beginning of the period during which the value " +
                        "of the Energy field was measured." +
                        "\n" +
                        "If this EnergyMeasurementStruct represents cumulative energy, this field shall be omitted." +
                        "\n" +
                        "Otherwise, if the server had determined the time in UTC at or before the beginning of the " +
                        "measurement period, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had not yet determined the time in UTC at or before the beginning of the " +
                        "measurement period, or does not have the capability of determining the time in UTC, this field shall " +
                        "be omitted."
                },

                {
                    tag: "field", name: "EndTimestamp", xref: "cluster§2.12.5.2.3",

                    details: "This field shall indicate the timestamp in UTC of the end of the period during which the value of " +
                        "the Energy field was measured." +
                        "\n" +
                        "If the server had determined the time in UTC by the end of the measurement period, this field shall " +
                        "be indicated." +
                        "\n" +
                        "Otherwise, if the server had not yet determined the time in UTC by the end of the measurement " +
                        "period, or does not have the capability of determining the time in UTC, this field shall be omitted."
                },

                {
                    tag: "field", name: "StartSystime", xref: "cluster§2.12.5.2.4",

                    details: "This field shall indicate the time elapsed since boot at the beginning of the period during which " +
                        "the value of the Energy field was measured." +
                        "\n" +
                        "If this EnergyMeasurementStruct represents cumulative energy, this field shall be omitted." +
                        "\n" +
                        "Otherwise, if the server had not yet determined the time in UTC at the start of the measurement " +
                        "period, or does not have the capability of determining the time in UTC, this field shall be " +
                        "indicated." +
                        "\n" +
                        "Otherwise, if the server had determined the time in UTC at or before the beginning of the " +
                        "measurement period, this field may be omitted; if it is indicated, its value shall be the time " +
                        "elapsed since boot at the UTC time indicated in StartTimestamp."
                },

                {
                    tag: "field", name: "EndSystime", xref: "cluster§2.12.5.2.5",

                    details: "This field shall indicate the time elapsed since boot at the end of the period during which the " +
                        "value of the Energy field was measured." +
                        "\n" +
                        "If the server had not yet determined the time in UTC by the end of the measurement period, or does " +
                        "not have the capability of determining the time in UTC, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had determined the time in UTC by the end of the measurement period, this " +
                        "field may be omitted; if it is indicated, its value shall be the time elapsed since boot at the UTC " +
                        "time indicated in EndTimestamp."
                }
            ]
        },

        {
            tag: "datatype", name: "CumulativeEnergyResetStruct", xref: "cluster§2.12.5.3",
            details: "This struct shall represent the times at which cumulative measurements were last zero, either due to " +
                "initialization of the device, or an internal reset of the cumulative value.",

            children: [
                {
                    tag: "field", name: "ImportedResetTimestamp", xref: "cluster§2.12.5.3.1",

                    details: "This field shall indicate the timestamp in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyImported attribute was most recently zero." +
                        "\n" +
                        "If the server had determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyImported attribute was most recently zero, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had not yet determined the time in UTC when the value of the Energy field " +
                        "on the CumulativeEnergyImported attribute was most recently zero, or does not have the capability of " +
                        "determining the time in UTC, this field shall be omitted." +
                        "\n" +
                        "If the timestamp in UTC when the value of the Energy field on the CumulativeEnergyImported attribute " +
                        "was most recently zero cannot currently be determined, a value of null shall be returned."
                },

                {
                    tag: "field", name: "ExportedResetTimestamp", xref: "cluster§2.12.5.3.2",

                    details: "This field shall indicate the timestamp in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyExported attribute was most recently zero." +
                        "\n" +
                        "If the server had determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyExported attribute was most recently zero, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had not yet determined the time in UTC when the value of the Energy field " +
                        "on the CumulativeEnergyExported attribute was most recently zero, or does not have the capability of " +
                        "determining the time in UTC, this field shall be omitted." +
                        "\n" +
                        "If the timestamp in UTC when the value of the Energy field on the CumulativeEnergyExported attribute " +
                        "was most recently zero cannot currently be determined, a value of null shall be returned."
                },

                {
                    tag: "field", name: "ImportedResetSystime", xref: "cluster§2.12.5.3.3",

                    details: "This field shall indicate the time elapsed since boot when the value of the Energy field on the " +
                        "CumulativeEnergyImported attribute was most recently zero." +
                        "\n" +
                        "If the server had not yet determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyImported attribute was most recently zero, or does not have the capability of " +
                        "determining the time in UTC, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyImported attribute was most recently zero, this field may be omitted; if it is " +
                        "indicated, its value shall be the time elapsed since boot at the UTC time indicated in " +
                        "ImportedResetTimestamp."
                },

                {
                    tag: "field", name: "ExportedResetSystime", xref: "cluster§2.12.5.3.4",

                    details: "This field shall indicate the time elapsed since boot when the value of the Energy field on the " +
                        "CumulativeEnergyExported attribute was most recently zero." +
                        "\n" +
                        "If the server had not yet determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyExported attribute was most recently zero, or does not have the capability of " +
                        "determining the time in UTC, this field shall be indicated." +
                        "\n" +
                        "Otherwise, if the server had determined the time in UTC when the value of the Energy field on the " +
                        "CumulativeEnergyExported attribute was most recently zero, this field may be omitted; if it is " +
                        "indicated, its value shall be the time elapsed since boot at the UTC time indicated in " +
                        "ImportedResetTimestamp."
                }
            ]
        }
    ]
});
