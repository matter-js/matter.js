/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "LaundryWasherControls", classification: "application", pics: "WASHERCTRL",
    xref: "cluster§8.6",
    details: "This cluster provides a way to access options associated with the operation of a laundry washer " +
        "device type.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.6.4",

            children: [
                {
                    tag: "field", name: "SPIN", xref: "cluster§8.6.4.1",
                    details: "This feature indicates multiple spin speeds are supported in at least one supported mode. Note that " +
                        "some modes may not support multiple spin speeds even if this feature is supported."
                },

                {
                    tag: "field", name: "RINSE", xref: "cluster§8.6.4.2",
                    details: "This feature indicates multiple rinse cycles are supported in at least one supported mode. Note that " +
                        "some modes may not support selection of the number of rinse cycles even if this feature is " +
                        "supported."
                }
            ]
        },

        {
            tag: "attribute", name: "SpinSpeeds", xref: "cluster§8.6.6.1",
            details: "Indicates the list of spin speeds available to the appliance in the currently selected mode. The " +
                "spin speed values are determined by the manufacturer. At least one spin speed value shall be " +
                "provided in the SpinSpeeds list. The list of spin speeds may change depending on the currently " +
                "selected Laundry Washer mode. For example, Quick mode might have a completely different list of " +
                "SpinSpeeds than Delicates mode."
        },

        {
            tag: "attribute", name: "SpinSpeedCurrent", xref: "cluster§8.6.6.2",

            details: "Indicates the currently selected spin speed. It is the index into the SpinSpeeds list of the " +
                "selected spin speed, as such, this attribute can be an integer between 0 and the number of entries " +
                "in SpinSpeeds - 1. If a value is received that is outside of the defined constraints, a " +
                "CONSTRAINT_ERROR shall be sent as the response. If a value is attempted to be written that doesn’t " +
                "match a valid index (e.g. an index of 5 when the list has 4 values), a CONSTRAINT_ERROR shall be" +
                "\n" +
                "sent as the response. If null is written to this attribute, there will be no spin speed for the " +
                "selected cycle. If the value is null, there will be no spin speed on the current mode."
        },

        {
            tag: "attribute", name: "NumberOfRinses", xref: "cluster§8.6.6.3",
            details: "Indicates how many times a rinse cycle shall be performed on a device for the current mode of " +
                "operation. A value of None shall indicate that no rinse cycle will be performed. This value may be " +
                "set by the client to adjust the number of rinses that are performed for the current mode of " +
                "operation. If the device is not in a compatible state to accept the provided value, an " +
                "INVALID_IN_STATE error shall be sent as the response."
        },

        {
            tag: "attribute", name: "SupportedRinses", xref: "cluster§8.6.6.4",
            details: "Indicates the amount of rinses allowed for a specific mode. Each entry shall indicate a " +
                "NumberOfRinsesEnum value that is possible in the selected mode on the device. The value of this " +
                "attribute may change at runtime based on the currently selected mode. Each entry shall be distinct."
        },

        {
            tag: "datatype", name: "NumberOfRinsesEnum", xref: "cluster§8.6.5.1",
            details: "The NumberOfRinsesEnum provides a representation of the number of rinses that will be performed for " +
                "a selected mode. NumberOfRinsesEnum is derived from enum8. It is up to the device manufacturer to " +
                "determine the mapping between the enum values and the corresponding numbers of rinses.",

            children: [
                { tag: "field", name: "None", description: "This laundry washer mode does not perform rinse cycles" },
                {
                    tag: "field", name: "Normal",
                    description: "This laundry washer mode performs normal rinse cycles determined by the manufacturer"
                },
                { tag: "field", name: "Extra", description: "This laundry washer mode performs an extra rinse cycle" },
                {
                    tag: "field", name: "Max",
                    description: "This laundry washer mode performs the maximum number of rinse cycles determined by the manufacturer"
                }
            ]
        }
    ]
});
