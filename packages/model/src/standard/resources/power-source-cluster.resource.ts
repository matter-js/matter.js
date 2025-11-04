/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "PowerSource", pics: "PS", xref: "core§11.7",
    details: "This cluster is used to describe the configuration and capabilities of a physical power source that " +
        "provides power to one or more endpoints on a node. In case the node has multiple power sources, each " +
        "shall be described by its own cluster instance. Each instance of this cluster may be associated with " +
        "one or more endpoints or the entire node.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.7.4",

            children: [
                { tag: "field", name: "WIRED", details: "A wired power source" },
                { tag: "field", name: "BAT", details: "A battery power source" },
                { tag: "field", name: "RECHG", details: "A rechargeable battery power source" },
                { tag: "field", name: "REPLC", details: "A replaceable battery power source" }
            ]
        },

        {
            tag: "attribute", name: "Status", xref: "core§11.7.7.1",
            details: "Indicates the participation of this power source in providing power to the Node as specified in " +
                "PowerSourceStatusEnum."
        },

        {
            tag: "attribute", name: "Order", xref: "core§11.7.7.2",

            details: "Indicates the relative preference with which the Node will select this source to provide power. A " +
                "source with a lower order shall be selected by the Node to provide power before any other source " +
                "with a higher order, if the lower order source is available (see Section 11.7.7.1, “Status " +
                "Attribute”)." +
                "\n" +
                "Note, Order is read-only and therefore NOT intended to allow clients control over power source " +
                "selection."
        },

        {
            tag: "attribute", name: "Description", xref: "core§11.7.7.3",
            details: "This attribute shall provide a user-facing description of this source, used to distinguish it from " +
                "other power sources, e.g. \"DC Power\", \"Primary Battery\" or \"Battery back-up\". This attribute shall " +
                "NOT be used to convey information such as battery form factor, or chemistry."
        },

        {
            tag: "attribute", name: "WiredAssessedInputVoltage", xref: "core§11.7.7.4",
            details: "Indicates the assessed RMS or DC voltage currently provided by the hard-wired source, in mV " +
                "(millivolts). A value of NULL shall indicate the Node is currently unable to assess the value. If " +
                "the wired source is not connected, but the Node is still able to assess a value, then the assessed " +
                "value may be reported."
        },

        {
            tag: "attribute", name: "WiredAssessedInputFrequency", xref: "core§11.7.7.5",
            details: "Indicates the assessed frequency of the voltage, currently provided by the hard-wired source, in Hz. " +
                "A value of NULL shall indicate the Node is currently unable to assess the value. If the wired source " +
                "is not connected, but the Node is still able to assess a value, then the assessed value may be " +
                "reported."
        },

        {
            tag: "attribute", name: "WiredCurrentType", xref: "core§11.7.7.6",
            details: "Indicates the type of current the Node expects to be provided by the hard-wired source as specified " +
                "in WiredCurrentTypeEnum."
        },

        {
            tag: "attribute", name: "WiredAssessedCurrent", xref: "core§11.7.7.7",
            details: "Indicates the assessed instantaneous current draw of the Node on the hard-wired source, in mA " +
                "(milliamps). A value of NULL shall indicate the Node is currently unable to assess the value. If the " +
                "wired source is not connected, but the Node is still able to assess a value, then the assessed value " +
                "may be reported."
        },

        {
            tag: "attribute", name: "WiredNominalVoltage", xref: "core§11.7.7.8",
            details: "Indicates the nominal voltage, printed as part of the Node’s regulatory compliance label in mV " +
                "(millivolts), expected to be provided by the hard-wired source."
        },
        {
            tag: "attribute", name: "WiredMaximumCurrent", xref: "core§11.7.7.9",
            details: "Indicates the maximum current, printed as part of the Node’s regulatory compliance label in mA " +
                "(milliamps), expected to be provided by the hard-wired source."
        },
        {
            tag: "attribute", name: "WiredPresent", xref: "core§11.7.7.10",
            details: "Indicates if the Node detects that the hard-wired power source is properly connected."
        },

        {
            tag: "attribute", name: "ActiveWiredFaults", xref: "core§11.7.7.11",

            details: "Indicates the set of wired faults currently detected by the Node on this power source. This set is " +
                "represented as a list of WiredFaultEnum. When the Node detects a fault has been raised, the " +
                "appropriate WiredFaultEnum value shall be added to this list, provided it is not already present. " +
                "This list shall NOT contain more than one instance of a specific WiredFaultEnum value. When the Node " +
                "detects all conditions contributing to a fault have been cleared, the corresponding WiredFaultEnum " +
                "value shall be removed from this list. An empty list shall indicate there are currently no active " +
                "faults. The order of this list SHOULD have no significance. Clients interested in monitoring changes " +
                "in active faults may subscribe to this attribute, or they may subscribe to WiredFaultChange."
        },

        {
            tag: "attribute", name: "BatVoltage", xref: "core§11.7.7.12",
            details: "Indicates the currently measured output voltage of the battery in mV (millivolts). A value of NULL " +
                "shall indicate the Node is currently unable to assess the value."
        },

        {
            tag: "attribute", name: "BatPercentRemaining", xref: "core§11.7.7.13",

            details: "Indicates the estimated percentage of battery charge remaining until the battery will no longer be " +
                "able to provide power to the Node. Values are expressed in half percent units, ranging from 0 to " +
                "200. E.g. a value of 48 is equivalent to 24%. A value of NULL shall indicate the Node is currently " +
                "unable to assess the value." +
                "\n" +
                "Changes to this attribute shall only be marked as reportable in the following cases:" +
                "\n" +
                "  • At most once every 10 seconds, or" +
                "\n" +
                "  • When it changes from null to any other value and vice versa." +
                "\n" +
                "Since reporting consumes power, devices SHOULD be careful not to over-report."
        },

        {
            tag: "attribute", name: "BatTimeRemaining", xref: "core§11.7.7.14",

            details: "Indicates the estimated time in seconds before the battery will no longer be able to provide power " +
                "to the Node. A value of NULL shall indicate the Node is currently unable to assess the value." +
                "\n" +
                "Changes to this attribute shall only be marked as reportable in the following cases:" +
                "\n" +
                "  • At most once every 10 seconds, or" +
                "\n" +
                "  • When it changes from null to any other value and vice versa." +
                "\n" +
                "Since reporting consumes power, devices SHOULD be careful not to over-report."
        },

        {
            tag: "attribute", name: "BatChargeLevel", xref: "core§11.7.7.15",
            details: "Indicates a coarse ranking of the charge level of the battery, used to indicate when intervention is " +
                "required as specified in BatChargeLevelEnum."
        },

        {
            tag: "attribute", name: "BatReplacementNeeded", xref: "core§11.7.7.16",
            details: "Indicates if the battery needs to be replaced. Replacement may be simple routine maintenance, such " +
                "as with a single use, non-rechargeable cell. Replacement, however, may also indicate end of life, or " +
                "serious fault with a rechargeable or even non-replaceable cell."
        },

        {
            tag: "attribute", name: "BatReplaceability", xref: "core§11.7.7.17",
            details: "Indicates the replaceability of the battery as specified in BatReplaceabilityEnum."
        },
        {
            tag: "attribute", name: "BatPresent", xref: "core§11.7.7.18",
            details: "Indicates whether the Node detects that the batteries are properly installed."
        },

        {
            tag: "attribute", name: "ActiveBatFaults", xref: "core§11.7.7.19",

            details: "Indicates the set of battery faults currently detected by the Node on this power source. This set is " +
                "represented as a list of BatFaultEnum. When the Node detects a fault has been raised, the " +
                "appropriate BatFaultEnum value shall be added to this list, provided it is not already present. This " +
                "list shall NOT contain more than one instance of a specific BatFaultEnum value. When the Node " +
                "detects all conditions contributing to a fault have been cleared, the corresponding BatFaultEnum " +
                "value shall be removed from this list. An empty list shall indicate there are currently no active " +
                "faults. The order of this list SHOULD have no significance. Clients interested in monitoring changes " +
                "in active faults may subscribe to this attribute, or they may subscribe to BatFaultChange."
        },

        {
            tag: "attribute", name: "BatReplacementDescription", xref: "core§11.7.7.20",
            details: "This attribute shall provide a user-facing description of this battery, which SHOULD contain " +
                "information required to identify a replacement, such as form factor, chemistry or preferred " +
                "manufacturer."
        },

        {
            tag: "attribute", name: "BatCommonDesignation", xref: "core§11.7.7.21",
            details: "Indicates the ID of the common or colloquial designation of the battery, as specified in " +
                "BatCommonDesignationEnum."
        },
        {
            tag: "attribute", name: "BatAnsiDesignation", xref: "core§11.7.7.22",
            details: "Indicates the string representing the ANSI designation for the battery as specified in ANSI C18."
        },
        {
            tag: "attribute", name: "BatIecDesignation", xref: "core§11.7.7.23",
            details: "Indicates the string representing the IEC designation for the battery as specified in IEC 60086."
        },
        {
            tag: "attribute", name: "BatApprovedChemistry", xref: "core§11.7.7.24",
            details: "Indicates the ID of the preferred chemistry of the battery source as specified in " +
                "BatApprovedChemistryEnum."
        },
        {
            tag: "attribute", name: "BatCapacity", xref: "core§11.7.7.25",
            details: "Indicates the preferred minimum charge capacity rating in mAh of individual, user- or " +
                "factory-serviceable battery cells or packs in the battery source."
        },
        {
            tag: "attribute", name: "BatQuantity", xref: "core§11.7.7.26",
            details: "Indicates the quantity of individual, user- or factory-serviceable battery cells or packs in the " +
                "battery source."
        },
        {
            tag: "attribute", name: "BatChargeState", xref: "core§11.7.7.27",
            details: "Indicates the current state of the battery source with respect to charging as specified in " +
                "BatChargeStateEnum."
        },

        {
            tag: "attribute", name: "BatTimeToFullCharge", xref: "core§11.7.7.28",

            details: "Indicates the estimated time in seconds before the battery source will be at full charge. A value of " +
                "NULL shall indicate the Node is currently unable to assess the value." +
                "\n" +
                "Changes to this attribute shall only be marked as reportable in the following cases:" +
                "\n" +
                "  • At most once every 10 seconds, or" +
                "\n" +
                "  • When it changes from null to any other value and vice versa." +
                "\n" +
                "Since reporting consumes power, devices SHOULD be careful not to over-report."
        },

        {
            tag: "attribute", name: "BatFunctionalWhileCharging", xref: "core§11.7.7.29",
            details: "Indicates whether the Node can remain operational while the battery source is charging."
        },
        {
            tag: "attribute", name: "BatChargingCurrent", xref: "core§11.7.7.30",
            details: "Indicates assessed current in mA (milliamps) presently supplied to charge the battery source. A " +
                "value of NULL shall indicate the Node is currently unable to assess the value."
        },

        {
            tag: "attribute", name: "ActiveBatChargeFaults", xref: "core§11.7.7.31",

            details: "Indicates the set of charge faults currently detected by the Node on this power source. This set is " +
                "represented as a list of BatChargeFaultEnum. When the Node detects a fault has been raised, the " +
                "appropriate BatChargeFaultEnum value shall be added to this list, provided it is not already " +
                "present. This list shall NOT contain more than one instance of a specific BatChargeFaultEnum value. " +
                "When the Node detects all conditions contributing to a fault have been cleared, the corresponding " +
                "BatChargeFaultEnum value shall be removed from this list. An empty list shall indicate there are " +
                "currently no active faults. The order of this list SHOULD have no significance. Clients interested " +
                "in monitoring changes in active faults may subscribe to this attribute, or they may subscribe to the " +
                "BatFaultChange event."
        },

        {
            tag: "attribute", name: "EndpointList", xref: "core§11.7.7.32",

            details: "Indicates a list of endpoints that are powered by the source defined by this cluster. Multiple " +
                "instances of this cluster may list the same endpoint, because it is possible for power for an " +
                "endpoint to come from multiple sources. In that case the Order attribute indicates their priority." +
                "\n" +
                "For each power source on a node, there shall only be one instance of this cluster." +
                "\n" +
                "A cluster instance with an empty list shall indicate that the power source is for the entire node, " +
                "which includes all endpoints." +
                "\n" +
                "A cluster instance with a non-empty list shall include the endpoint, upon which the cluster instance " +
                "resides." +
                "\n" +
                "The above rules allow that some endpoints can have an unknown power source, and therefore would not " +
                "be indicated by any instance of this cluster." +
                "\n" +
                "### Empty list examples" +
                "\n" +
                "Typically, there is one power source for the node. Also common is mains power for the node with " +
                "battery backup power for the node. In both these common cases, for each cluster instance described, " +
                "the list is empty." +
                "\n" +
                "### Populated list example" +
                "\n" +
                "A node has a mains power source with Order as 0 (zero), but some application endpoints (not all) " +
                "have a battery back up source with Order as 1, which means this list is empty for the Power Source " +
                "cluster associated with the mains power, because it indicates the entire node, but the Power Source " +
                "cluster instance associated with the battery backup would list the endpoints that have a battery " +
                "backup."
        },

        {
            tag: "event", name: "WiredFaultChange", xref: "core§11.7.8.1",
            details: "The WiredFaultChange Event shall be generated when the set of wired faults currently detected by the " +
                "Node on this wired power source changes. This event shall correspond to a change in value of " +
                "ActiveWiredFaults.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.7.8.1.1",
                    details: "This field shall represent the set of faults currently detected, as per ActiveWiredFaults."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.7.8.1.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "ActiveWiredFaults."
                }
            ]
        },

        {
            tag: "event", name: "BatFaultChange", xref: "core§11.7.8.2",
            details: "The BatFaultChange Event shall be generated when the set of battery faults currently detected by the " +
                "Node on this battery power source changes. This event shall correspond to a change in value of " +
                "ActiveBatFaults.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.7.8.2.1",
                    details: "This field shall represent the set of faults currently detected, as per ActiveBatFaults."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.7.8.2.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "ActiveBatFaults."
                }
            ]
        },

        {
            tag: "event", name: "BatChargeFaultChange", xref: "core§11.7.8.3",
            details: "The BatChargeFaultChange Event shall be generated when the set of charge faults currently detected " +
                "by the Node on this battery power source changes. This event shall correspond to a change in value " +
                "of ActiveBatChargeFaults.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.7.8.3.1",
                    details: "This field shall represent the set of faults currently detected, as per ActiveBatChargeFaults."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.7.8.3.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per " +
                        "ActiveBatChargeFaults."
                }
            ]
        },

        {
            tag: "datatype", name: "WiredFaultEnum", xref: "core§11.7.6.1",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "The Node detects an unspecified fault on this wired power source."
                },
                {
                    tag: "field", name: "OverVoltage",
                    description: "The Node detects the supplied voltage is above maximum supported value for this wired power source."
                },
                {
                    tag: "field", name: "UnderVoltage",
                    description: "The Node detects the supplied voltage is below maximum supported value for this wired power source."
                }
            ]
        },

        {
            tag: "datatype", name: "BatFaultEnum", xref: "core§11.7.6.2",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "The Node detects an unspecified fault on this battery power source."
                },
                {
                    tag: "field", name: "OverTemp",
                    description: "The Node detects the temperature of this battery power source is above ideal operating conditions."
                },
                {
                    tag: "field", name: "UnderTemp",
                    description: "The Node detects the temperature of this battery power source is below ideal operating conditions."
                }
            ]
        },

        {
            tag: "datatype", name: "BatChargeFaultEnum", xref: "core§11.7.6.3",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "The Node detects an unspecified fault on this battery source."
                },
                {
                    tag: "field", name: "AmbientTooHot",
                    description: "The Node detects the ambient temperature is above the nominal range for this battery source."
                },
                {
                    tag: "field", name: "AmbientTooCold",
                    description: "The Node detects the ambient temperature is below the nominal range for this battery source."
                },
                {
                    tag: "field", name: "BatteryTooHot",
                    description: "The Node detects the temperature of this battery source is above the nominal range."
                },
                {
                    tag: "field", name: "BatteryTooCold",
                    description: "The Node detects the temperature of this battery source is below the nominal range."
                },
                {
                    tag: "field", name: "BatteryAbsent",
                    description: "The Node detects this battery source is not present."
                },
                {
                    tag: "field", name: "BatteryOverVoltage",
                    description: "The Node detects this battery source is over voltage."
                },
                {
                    tag: "field", name: "BatteryUnderVoltage",
                    description: "The Node detects this battery source is under voltage."
                },
                {
                    tag: "field", name: "ChargerOverVoltage",
                    description: "The Node detects the charger for this battery source is over voltage."
                },
                {
                    tag: "field", name: "ChargerUnderVoltage",
                    description: "The Node detects the charger for this battery source is under voltage."
                },
                {
                    tag: "field", name: "SafetyTimeout",
                    description: "The Node detects a charging safety timeout for this battery source."
                }
            ]
        },

        {
            tag: "datatype", name: "PowerSourceStatusEnum", xref: "core§11.7.6.4",

            children: [
                { tag: "field", name: "Unspecified", description: "Indicate the source status is not specified" },
                {
                    tag: "field", name: "Active",
                    description: "Indicate the source is available and currently supplying power"
                },
                {
                    tag: "field", name: "Standby",
                    description: "Indicate the source is available, but is not currently supplying power"
                },
                {
                    tag: "field", name: "Unavailable",
                    description: "Indicate the source is not currently available to supply power"
                }
            ]
        },

        {
            tag: "datatype", name: "WiredCurrentTypeEnum", xref: "core§11.7.6.5",
            children: [
                { tag: "field", name: "Ac", description: "Indicates AC current" },
                { tag: "field", name: "Dc", description: "Indicates DC current" }
            ]
        },

        {
            tag: "datatype", name: "BatChargeLevelEnum", xref: "core§11.7.6.6",

            children: [
                { tag: "field", name: "Ok", description: "Charge level is nominal" },
                {
                    tag: "field", name: "Warning",
                    description: "Charge level is low, intervention may soon be required."
                },
                {
                    tag: "field", name: "Critical",
                    description: "Charge level is critical, immediate intervention is required"
                }
            ]
        },

        {
            tag: "datatype", name: "BatReplaceabilityEnum", xref: "core§11.7.6.7",

            children: [
                { tag: "field", name: "Unspecified", description: "The replaceability is unspecified or unknown." },
                { tag: "field", name: "NotReplaceable", description: "The battery is not replaceable." },
                {
                    tag: "field", name: "UserReplaceable",
                    description: "The battery is replaceable by the user or customer."
                },
                {
                    tag: "field", name: "FactoryReplaceable",
                    description: "The battery is replaceable by an authorized factory technician."
                }
            ]
        },

        {
            tag: "datatype", name: "BatCommonDesignationEnum", xref: "core§11.7.6.8",

            children: [
                { tag: "field", name: "Unspecified", description: "Common type is unknown or unspecified" },
                { tag: "field", name: "Aaa", description: "Common type is as specified" },
                { tag: "field", name: "Aa", description: "Common type is as specified" },
                { tag: "field", name: "4V5", description: "Common type is as specified" },
                { tag: "field", name: "6V0", description: "Common type is as specified" },
                { tag: "field", name: "9V0", description: "Common type is as specified" },
                { tag: "field", name: "12Aa", description: "Common type is as specified" },
                { tag: "field", name: "Aaaa", description: "Common type is as specified" },
                { tag: "field", name: "No6", description: "Common type is as specified" },
                { tag: "field", name: "SubC", description: "Common type is as specified" },
                { tag: "field", name: "A23", description: "Common type is as specified" },
                { tag: "field", name: "A27", description: "Common type is as specified" },
                { tag: "field", name: "Ba5800", description: "Common type is as specified" },
                { tag: "field", name: "Duplex", description: "Common type is as specified" },
                { tag: "field", name: "4Sr44", description: "Common type is as specified" },
                { tag: "field", name: "523", description: "Common type is as specified" },
                { tag: "field", name: "531", description: "Common type is as specified" },
                { tag: "field", name: "15V0", description: "Common type is as specified" },
                { tag: "field", name: "22V5", description: "Common type is as specified" },
                { tag: "field", name: "30V0", description: "Common type is as specified" },
                { tag: "field", name: "45V0", description: "Common type is as specified" },
                { tag: "field", name: "67V5", description: "Common type is as specified" },
                { tag: "field", name: "Cr123A", description: "Common type is as specified" },
                { tag: "field", name: "Cr2", description: "Common type is as specified" },
                { tag: "field", name: "2Cr5", description: "Common type is as specified" },
                { tag: "field", name: "CrP2", description: "Common type is as specified" },
                { tag: "field", name: "CrV3", description: "Common type is as specified" },
                { tag: "field", name: "Sr41", description: "Common type is as specified" },
                { tag: "field", name: "Sr43", description: "Common type is as specified" },
                { tag: "field", name: "Sr44", description: "Common type is as specified" },
                { tag: "field", name: "Sr45", description: "Common type is as specified" },
                { tag: "field", name: "Sr48", description: "Common type is as specified" },
                { tag: "field", name: "Sr54", description: "Common type is as specified" },
                { tag: "field", name: "Sr55", description: "Common type is as specified" },
                { tag: "field", name: "Sr57", description: "Common type is as specified" },
                { tag: "field", name: "Sr58", description: "Common type is as specified" },
                { tag: "field", name: "Sr59", description: "Common type is as specified" },
                { tag: "field", name: "Sr60", description: "Common type is as specified" },
                { tag: "field", name: "Sr63", description: "Common type is as specified" },
                { tag: "field", name: "Sr64", description: "Common type is as specified" },
                { tag: "field", name: "Sr65", description: "Common type is as specified" },
                { tag: "field", name: "Sr66", description: "Common type is as specified" },
                { tag: "field", name: "Sr67", description: "Common type is as specified" },
                { tag: "field", name: "Sr68", description: "Common type is as specified" },
                { tag: "field", name: "Sr69", description: "Common type is as specified" },
                { tag: "field", name: "Sr516", description: "Common type is as specified" },
                { tag: "field", name: "Sr731", description: "Common type is as specified" },
                { tag: "field", name: "Sr712", description: "Common type is as specified" },
                { tag: "field", name: "Lr932", description: "Common type is as specified" },
                { tag: "field", name: "A5", description: "Common type is as specified" },
                { tag: "field", name: "A10", description: "Common type is as specified" },
                { tag: "field", name: "A13", description: "Common type is as specified" },
                { tag: "field", name: "A312", description: "Common type is as specified" },
                { tag: "field", name: "A675", description: "Common type is as specified" },
                { tag: "field", name: "Ac41E", description: "Common type is as specified" },
                { tag: "field", name: "10180", description: "Common type is as specified" },
                { tag: "field", name: "10280", description: "Common type is as specified" },
                { tag: "field", name: "10440", description: "Common type is as specified" },
                { tag: "field", name: "14250", description: "Common type is as specified" },
                { tag: "field", name: "14430", description: "Common type is as specified" },
                { tag: "field", name: "14500", description: "Common type is as specified" },
                { tag: "field", name: "14650", description: "Common type is as specified" },
                { tag: "field", name: "15270", description: "Common type is as specified" },
                { tag: "field", name: "16340", description: "Common type is as specified" },
                { tag: "field", name: "Rcr123A", description: "Common type is as specified" },
                { tag: "field", name: "17500", description: "Common type is as specified" },
                { tag: "field", name: "17670", description: "Common type is as specified" },
                { tag: "field", name: "18350", description: "Common type is as specified" },
                { tag: "field", name: "18500", description: "Common type is as specified" },
                { tag: "field", name: "18650", description: "Common type is as specified" },
                { tag: "field", name: "19670", description: "Common type is as specified" },
                { tag: "field", name: "25500", description: "Common type is as specified" },
                { tag: "field", name: "26650", description: "Common type is as specified" },
                { tag: "field", name: "32600", description: "Common type is as specified" }
            ]
        },

        {
            tag: "datatype", name: "BatApprovedChemistryEnum", xref: "core§11.7.6.9",

            children: [
                { tag: "field", name: "Unspecified", description: "Cell chemistry is unspecified or unknown" },
                { tag: "field", name: "Alkaline", description: "Cell chemistry is alkaline" },
                {
                    tag: "field", name: "LithiumCarbonFluoride",
                    description: "Cell chemistry is lithium carbon fluoride"
                },
                { tag: "field", name: "LithiumChromiumOxide", description: "Cell chemistry is lithium chromium oxide" },
                { tag: "field", name: "LithiumCopperOxide", description: "Cell chemistry is lithium copper oxide" },
                { tag: "field", name: "LithiumIronDisulfide", description: "Cell chemistry is lithium iron disulfide" },
                {
                    tag: "field", name: "LithiumManganeseDioxide",
                    description: "Cell chemistry is lithium manganese dioxide"
                },
                {
                    tag: "field", name: "LithiumThionylChloride",
                    description: "Cell chemistry is lithium thionyl chloride"
                },
                { tag: "field", name: "Magnesium", description: "Cell chemistry is magnesium" },
                { tag: "field", name: "MercuryOxide", description: "Cell chemistry is mercury oxide" },
                { tag: "field", name: "NickelOxyhydride", description: "Cell chemistry is nickel oxyhydride" },
                { tag: "field", name: "SilverOxide", description: "Cell chemistry is silver oxide" },
                { tag: "field", name: "ZincAir", description: "Cell chemistry is zinc air" },
                { tag: "field", name: "ZincCarbon", description: "Cell chemistry is zinc carbon" },
                { tag: "field", name: "ZincChloride", description: "Cell chemistry is zinc chloride" },
                { tag: "field", name: "ZincManganeseDioxide", description: "Cell chemistry is zinc manganese dioxide" },
                { tag: "field", name: "LeadAcid", description: "Cell chemistry is lead acid" },
                { tag: "field", name: "LithiumCobaltOxide", description: "Cell chemistry is lithium cobalt oxide" },
                { tag: "field", name: "LithiumIon", description: "Cell chemistry is lithium ion" },
                { tag: "field", name: "LithiumIonPolymer", description: "Cell chemistry is lithium ion polymer" },
                { tag: "field", name: "LithiumIronPhosphate", description: "Cell chemistry is lithium iron phosphate" },
                { tag: "field", name: "LithiumSulfur", description: "Cell chemistry is lithium sulfur" },
                { tag: "field", name: "LithiumTitanate", description: "Cell chemistry is lithium titanate" },
                { tag: "field", name: "NickelCadmium", description: "Cell chemistry is nickel cadmium" },
                { tag: "field", name: "NickelHydrogen", description: "Cell chemistry is nickel hydrogen" },
                { tag: "field", name: "NickelIron", description: "Cell chemistry is nickel iron" },
                { tag: "field", name: "NickelMetalHydride", description: "Cell chemistry is nickel metal hydride" },
                { tag: "field", name: "NickelZinc", description: "Cell chemistry is nickel zinc" },
                { tag: "field", name: "SilverZinc", description: "Cell chemistry is silver zinc" },
                { tag: "field", name: "SodiumIon", description: "Cell chemistry is sodium ion" },
                { tag: "field", name: "SodiumSulfur", description: "Cell chemistry is sodium sulfur" },
                { tag: "field", name: "ZincBromide", description: "Cell chemistry is zinc bromide" },
                { tag: "field", name: "ZincCerium", description: "Cell chemistry is zinc cerium" }
            ]
        },

        {
            tag: "datatype", name: "BatChargeStateEnum", xref: "core§11.7.6.10",

            children: [
                { tag: "field", name: "Unknown", description: "Unable to determine the charging state" },
                { tag: "field", name: "IsCharging", description: "The battery is charging" },
                { tag: "field", name: "IsAtFullCharge", description: "The battery is at full charge" },
                { tag: "field", name: "IsNotCharging", description: "The battery is not charging" }
            ]
        }
    ]
});
