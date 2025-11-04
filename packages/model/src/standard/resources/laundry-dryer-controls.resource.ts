/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "LaundryDryerControls", pics: "DRYERCTRL", xref: "cluster§8.9",
    details: "This cluster provides a way to access options associated with the operation of a laundry dryer " +
        "device type.",

    children: [
        {
            tag: "attribute", name: "SupportedDrynessLevels", xref: "cluster§8.9.5.1",
            details: "Indicates the list of supported dryness levels available to the appliance in the currently selected " +
                "mode. The dryness level values are determined by the manufacturer. At least one dryness level value " +
                "shall be provided in the SupportedDrynessLevels list. The list of dryness levels may change " +
                "depending on the currently-selected Laundry Dryer mode."
        },

        {
            tag: "attribute", name: "SelectedDrynessLevel", xref: "cluster§8.9.5.2",

            details: "Indicates the currently-selected dryness level and it shall be the index into the " +
                "SupportedDrynessLevels list of the selected dryness level." +
                "\n" +
                "If an attempt is made to write this attribute with a value other than null or a value contained in " +
                "SupportedDrynessLevels, a CONSTRAINT_ERROR response shall be sent as the response. If an attempt is " +
                "made to write this attribute while the device is not in a state that supports modifying the dryness " +
                "level, an INVALID_IN_STATE error shall be sent as the response. A value of null shall indicate that " +
                "there will be no dryness level setting for the current mode."
        },

        {
            tag: "datatype", name: "DrynessLevelEnum", xref: "cluster§8.9.4.1",
            details: "This enum provides a representation of the level of dryness that will be used while drying in a " +
                "selected mode." +
                "\n" +
                "It is up to the device manufacturer to determine the mapping between the enum values and the " +
                "corresponding temperature level.",

            children: [
                { tag: "field", name: "Low", description: "Provides a low dryness level for the selected mode" },
                {
                    tag: "field", name: "Normal",
                    description: "Provides the normal level of dryness for the selected mode"
                },
                { tag: "field", name: "Extra", description: "Provides an extra dryness level for the selected mode" },
                { tag: "field", name: "Max", description: "Provides the max dryness level for the selected mode" }
            ]
        }
    ]
});
