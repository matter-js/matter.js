/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ElectricalPowerMeasurement", classification: "application", pics: "EPM",
    xref: "cluster§2.13",
    details: "This cluster provides a mechanism for querying data about electrical power as measured by the " +
        "server.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.13.4",

            children: [
                {
                    tag: "field", name: "DIRC", xref: "cluster§2.13.4.1",
                    details: "This feature indicates the cluster can measure a direct current."
                },
                {
                    tag: "field", name: "ALTC", xref: "cluster§2.13.4.2",
                    details: "This feature indicates the cluster can measure an alternating current."
                },
                {
                    tag: "field", name: "POLY", xref: "cluster§2.13.4.3",
                    details: "This feature indicates the cluster represents the collective measurements for a Polyphase power " +
                        "supply."
                },
                {
                    tag: "field", name: "HARM", xref: "cluster§2.13.4.4",
                    details: "This feature indicates the cluster can measure the harmonics of an alternating current."
                },
                {
                    tag: "field", name: "PWRQ", xref: "cluster§2.13.4.5",
                    details: "This feature indicates the cluster can measure the harmonic phases of an alternating current."
                }
            ]
        },

        {
            tag: "attribute", name: "PowerMode", xref: "cluster§2.13.6.1",
            details: "This shall indicate the current mode of the server. For some servers, such as an EV, this may change " +
                "depending on the mode of charging or discharging."
        },
        {
            tag: "attribute", name: "NumberOfMeasurementTypes", xref: "cluster§2.13.6.2",
            details: "This shall indicate the maximum number of measurement types the server is capable of reporting."
        },

        {
            tag: "attribute", name: "Accuracy", xref: "cluster§2.13.6.3",
            details: "This shall indicate a list of accuracy specifications for the measurement types supported by the " +
                "server. There shall be an entry for ActivePower, as well as any other measurement types implemented " +
                "by this server."
        },

        {
            tag: "attribute", name: "Ranges", xref: "cluster§2.13.6.4",

            details: "This shall indicate a list of measured ranges for different measurement types. Each measurement type " +
                "shall have at most one entry in this list, representing the range of measurements in the most recent " +
                "measurement period." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds."
        },

        {
            tag: "attribute", name: "Voltage", xref: "cluster§2.13.6.5",

            details: "This shall indicate the most recent Voltage reading in millivolts (mV)." +
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
                "If the voltage cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "ActiveCurrent", xref: "cluster§2.13.6.6",

            details: "This shall indicate the most recent ActiveCurrent reading in milliamps (mA)." +
                "\n" +
                "A positive value represents current flowing into the server, while a negative value represents " +
                "current flowing out of the server." +
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
                "If the current cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "ReactiveCurrent", xref: "cluster§2.13.6.7",

            details: "This shall indicate the most recent ReactiveCurrent reading in milliamps (mA)." +
                "\n" +
                "A positive value represents current flowing into the server, while a negative value represents " +
                "current flowing out of the server." +
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
                "If the current cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "ApparentCurrent", xref: "cluster§2.13.6.8",

            details: "This shall indicate the most recent ApparentCurrent (square root sum of the squares of active and " +
                "reactive currents) reading in milliamps (mA)." +
                "\n" +
                "A positive value represents current flowing into the server, while a negative value represents " +
                "current flowing out of the server." +
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
                "If the active or reactive currents cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "ActivePower", xref: "cluster§2.13.6.9",

            details: "This shall indicate the most recent ActivePower reading in milliwatts (mW). If the power cannot be " +
                "measured, a value of null shall be returned." +
                "\n" +
                "A positive value represents power imported, while a negative value represents power exported." +
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
                "If the Polyphase Power feature is set, this value represents the combined active power imported or " +
                "exported."
        },

        {
            tag: "attribute", name: "ReactivePower", xref: "cluster§2.13.6.10",

            details: "This shall indicate the most recent ReactivePower reading in millivolt-amps reactive (mVAR). A " +
                "positive value represents power imported, while a negative value represents power exported." +
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
                "If the reactive power cannot be measured, a value of null shall be returned." +
                "\n" +
                "If the Polyphase Power feature is supported, this value represents the combined reactive power " +
                "imported or exported."
        },

        {
            tag: "attribute", name: "ApparentPower", xref: "cluster§2.13.6.11",

            details: "This shall indicate the most recent ApparentPower reading in millivolt-amps (mVA)." +
                "\n" +
                "A positive value represents power imported, while a negative value represents power exported." +
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
                "If the apparent power cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "RmsVoltage", xref: "cluster§2.13.6.12",

            details: "This shall indicate the most recent RMSVoltage reading in millivolts (mV)." +
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
                "If the RMS voltage cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "RmsCurrent", xref: "cluster§2.13.6.13",

            details: "This shall indicate the most recent RMSCurrent reading in milliamps (mA)." +
                "\n" +
                "A positive value represents current flowing into the server, while a negative value represents " +
                "current flowing out of the server." +
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
                "If the RMS current cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "RmsPower", xref: "cluster§2.13.6.14",

            details: "This shall indicate the most recent RMSPower reading in milliwatts (mW)." +
                "\n" +
                "A positive value represents power imported, while a negative value represents power exported." +
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
                "If the RMS power cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "Frequency", xref: "cluster§2.13.6.15",

            details: "This shall indicate the most recent Frequency reading in millihertz (mHz)." +
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
                "If the frequency cannot be measured, a value of null shall be returned."
        },

        {
            tag: "attribute", name: "HarmonicCurrents", xref: "cluster§2.13.6.16",

            details: "This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct " +
                "representing the harmonic current reading for the harmonic order specified by Order." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds."
        },

        {
            tag: "attribute", name: "HarmonicPhases", xref: "cluster§2.13.6.17",

            details: "This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct " +
                "representing the most recent phase of the harmonic current reading for the harmonic order specified " +
                "by Order." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds."
        },

        {
            tag: "attribute", name: "PowerFactor", xref: "cluster§2.13.6.18",

            details: "This shall indicate the Power Factor ratio in +/- 1/100ths of a percent." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds."
        },

        {
            tag: "attribute", name: "NeutralCurrent", xref: "cluster§2.13.6.19",

            details: "This shall indicate the most recent NeutralCurrent reading in milliamps (mA). Typically this is a " +
                "derived value, taking the magnitude of the vector sum of phase currents." +
                "\n" +
                "If the neutral current cannot be measured or derived, a value of null shall be returned." +
                "\n" +
                "A positive value represents an imbalance between the phase currents when power is imported. A " +
                "negative value represents an imbalance between the phase currents when power is exported." +
                "\n" +
                "The reporting interval of this attribute shall be manufacturer dependent. The server may choose to " +
                "omit publication of deltas considered not meaningful." +
                "\n" +
                "The server shall NOT mark this attribute ready for report if the last time this was done was more " +
                "recently than 1 second ago." +
                "\n" +
                "The server may delay marking this attribute ready for report for longer periods if needed, however " +
                "the server shall NOT delay marking this attribute as ready for report for longer than 60 seconds."
        },

        {
            tag: "event", name: "MeasurementPeriodRanges", xref: "cluster§2.13.7.1",
            details: "If supported, this event shall be generated at the end of a measurement period. The start and end " +
                "times for measurement periods shall be determined by the server, and may represent overlapping " +
                "periods.",
            children: [{
                tag: "field", name: "Ranges", xref: "cluster§2.13.7.1.1",
                details: "This shall indicate the value of the Ranges attribute at the time of event generation."
            }]
        },

        {
            tag: "datatype", name: "PowerModeEnum", xref: "cluster§2.13.5.1",
            children: [
                { tag: "field", name: "Dc", description: "Direct current" },
                { tag: "field", name: "Ac", description: "Alternating current, either single-phase or polyphase" }
            ]
        },

        {
            tag: "datatype", name: "MeasurementTypeEnum", xref: "cluster§2.13.5.2",

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
            tag: "datatype", name: "MeasurementRangeStruct", xref: "cluster§2.13.5.3",

            details: "This struct shall indicate the maximum and minimum values of a given measurement type during a " +
                "measurement period, along with the observation times of these values." +
                "\n" +
                "A server which does not have the ability to determine the time in UTC, or has not yet done so, shall " +
                "use the system time fields to specify the measurement period and observation times." +
                "\n" +
                "A server which has determined the time in UTC shall use the timestamp fields to specify the " +
                "measurement period and observation times. Such a server may also include the systime fields to " +
                "indicate how many seconds had passed since boot for a given timestamp; this allows for client-side " +
                "resolution of UTC time for previous reports that only included systime.",

            children: [
                {
                    tag: "field", name: "MeasurementType", xref: "cluster§2.13.5.3.1",
                    details: "This field shall be the type of measurement for the range provided."
                },

                {
                    tag: "field", name: "Min", xref: "cluster§2.13.5.3.2",
                    details: "This field shall be the smallest measured value for the associated measurement over either the " +
                        "period between StartTimestamp and EndTimestamp, or the period between StartSystime and EndSystime, " +
                        "or both."
                },

                {
                    tag: "field", name: "Max", xref: "cluster§2.13.5.3.3",
                    details: "This field shall be the largest measured value for the associated measurement over the period " +
                        "between either StartTimestamp and EndTimestamp or the period between StartSystime and EndSystime, or " +
                        "both."
                },

                {
                    tag: "field", name: "StartTimestamp", xref: "cluster§2.13.5.3.4",
                    details: "This field shall be the timestamp in UTC of the beginning of the measurement period." +
                        "\n" +
                        "If the server had not yet determined the time in UTC at or before the beginning of the measurement " +
                        "period, or does not have the capability of determining the time in UTC, this field shall be omitted."
                },

                {
                    tag: "field", name: "EndTimestamp", xref: "cluster§2.13.5.3.5",
                    details: "This field shall be the timestamp in UTC of the end of the measurement period." +
                        "\n" +
                        "If the server had not yet determined the time in UTC at or before the beginning of the measurement " +
                        "period, or does not have the capability of determining the time in UTC, this field shall be omitted."
                },

                {
                    tag: "field", name: "MinTimestamp", xref: "cluster§2.13.5.3.6",
                    details: "This field shall be the most recent timestamp in UTC that the value in the Min field was measured." +
                        "\n" +
                        "This field shall be greater than or equal to the value of the StartTimestamp field. This field shall " +
                        "be less than or equal to the value of the EndTimestamp field."
                },

                {
                    tag: "field", name: "MaxTimestamp", xref: "cluster§2.13.5.3.7",
                    details: "This field shall be the most recent timestamp in UTC of the value in the Max field. This field shall " +
                        "be greater than or equal to the value of the StartTimestamp field. This field shall be less than or " +
                        "equal to the value of the EndTimestamp field."
                },

                {
                    tag: "field", name: "StartSystime", xref: "cluster§2.13.5.3.8",
                    details: "This field shall be the time since boot of the beginning of the measurement period." +
                        "\n" +
                        "If the server had determined the time in UTC at or before the start of the measurement period, this " +
                        "field may be omitted along with the EndSystime, MinSystime, and MaxSystime fields."
                },

                {
                    tag: "field", name: "EndSystime", xref: "cluster§2.13.5.3.9",
                    details: "This field shall be the time since boot of the end of the measurement period." +
                        "\n" +
                        "If the server had determined the time in UTC at the end of the measurement period, this field may be " +
                        "omitted along with the StartSystime field, MinSystime, and MaxSystime fields."
                },

                {
                    tag: "field", name: "MinSystime", xref: "cluster§2.13.5.3.10",
                    details: "This field shall be the measurement time since boot of the value in the Min field was measured. This " +
                        "field shall be greater than or equal to the value of the StartSystime field." +
                        "\n" +
                        "This field shall be less than or equal to the value of the EndSystime field."
                },

                {
                    tag: "field", name: "MaxSystime", xref: "cluster§2.13.5.3.11",
                    details: "This field shall be the measurement time since boot of the value in the Max field. This field shall " +
                        "be greater than or equal to the value of the StartSystime field." +
                        "\n" +
                        "This field shall be less than or equal to the value of the EndSystime field."
                }
            ]
        },

        {
            tag: "datatype", name: "HarmonicMeasurementStruct", xref: "cluster§2.13.5.4",

            children: [
                {
                    tag: "field", name: "Order", xref: "cluster§2.13.5.4.1",
                    details: "This field shall be the order of the harmonic being measured. Typically this is an odd number, but " +
                        "servers may choose to report even harmonics."
                },

                {
                    tag: "field", name: "Measurement", xref: "cluster§2.13.5.4.2",

                    details: "This field shall be the measured value for the given harmonic order." +
                        "\n" +
                        "For the Harmonic Currents attribute, this value is the most recently measured harmonic current " +
                        "reading in milliamps (mA). A positive value indicates that the measured harmonic current is " +
                        "positive, and a negative value indicates that the measured harmonic current is negative." +
                        "\n" +
                        "For the Harmonic Phases attribute, this value is the most recent phase of the given harmonic order " +
                        "in millidegrees (mDeg). A positive value indicates that the measured phase is leading, and a " +
                        "negative value indicates that the measured phase is lagging." +
                        "\n" +
                        "If this measurement is not currently available, a value of null shall be returned."
                }
            ]
        }
    ]
});
