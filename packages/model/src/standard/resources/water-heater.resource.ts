/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WaterHeater", xref: "device§14.2",

    details: "A water heater is a device that is generally installed in properties to heat water for showers, " +
        "baths etc." +
        "\n" +
        "### Water Heater Architecture" +
        "\n" +
        "A Water Heater is always defined via endpoint composition." +
        "\n" +
        "If a Water Heater supports multiple temperature measurement sensors as child elements, it shall " +
        "include a separate endpoint for each sensor. Each endpoint shall include a semantic tag in the " +
        "TagList attribute of the Descriptor cluster to describe the relevant position of the sensor. Such a " +
        "semantic tag shall be from the defined Common Position namespace (i.e. Top, Middle, Bottom etc)." +
        "\n" +
        "For basic control features the Water Heater re-uses the Thermostat cluster with the HEAT and SCH " +
        "features. This allows it to have daily schedules set as to when the hot water heating is enabled, as " +
        "well as setting the desired setpoint of the hot water." +
        "\n" +
        "Additional features of the Water Heater (such as reporting estimated hot water content, and smart " +
        "reheating functions) are provided by the Water Heater application cluster." +
        "\n" +
        "In order to add energy management capability, the Device Energy Management cluster may be optionally " +
        "supported, and if so, the Electrical Power Measurement and Electrical Energy Measurement clusters " +
        "are supported via the Electrical Sensor device type." +
        "\n" +
        "An example of a Water Heater device is illustrated below." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "The Energy Management feature of the Water Heater cluster shall be supported if the Device Energy " +
        "Management device type is included." +
        "\n" +
        "If Off is a supported SystemMode in the Thermostat cluster, setting the SystemMode of the Thermostat " +
        "cluster to Off shall set the CurrentMode attribute of the Water Heater Mode cluster to a mode having " +
        "the Off mode tag value and vice versa." +
        "\n" +
        "At least one entry in the SupportedModes attribute of the Water Heater Mode cluster shall include " +
        "the Timed mode tag in the ModeTags field list." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Water Heater shall be composed of at least one endpoint with device types as defined by the " +
        "conformance below. There may be more endpoints with other device types existing in the Water Heater." +
        "\n" +
        "#### Electrical Sensor Device Type" +
        "\n" +
        "If a Device Energy Management device type is included as part of a composition, the Electrical " +
        "Sensor device type shall also be included." +
        "\n" +
        "#### Cluster Requirements on Component Device Types" +
        "\n" +
        "If an Electrical Sensor device is included as part of a composition, it shall include both the " +
        "Electrical Energy Measurement and Electrical Power Measurement clusters, measuring the total energy " +
        "and power of the Water Heater." +
        "\n" +
        "#### Element Requirements on Component Device Types" +
        "\n" +
        "If a Device Energy Management device type is included on a separate endpoint as part of a " +
        "composition and the Device Energy Management cluster is supported on the same endpoint, the " +
        "PowerForecastReporting feature of the Device Energy Management cluster shall also be supported.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.2.5" },
        { tag: "requirement", name: "WaterHeaterManagement", xref: "device§14.2.5" },
        { tag: "requirement", name: "WaterHeaterMode", xref: "device§14.2.5" },
        {
            tag: "requirement", name: "Thermostat", xref: "device§14.2.5",
            children: [{ tag: "requirement", name: "HEATING", xref: "device§14.2.6" }]
        },
        { tag: "requirement", name: "PowerSource", xref: "device§14.2.7" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§14.2.7" },

        {
            tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.2.7",
            children: [{
                tag: "requirement", name: "DeviceEnergyManagement",
                children: [{ tag: "requirement", name: "POWERFORECASTREPORTING", xref: "device§14.2.7.3" }]
            }]
        },

        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.2.7" }
    ]
});
