/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "BooleanState", pics: "BOOL", xref: "cluster§1.7",
    details: "This cluster provides an interface to a boolean state.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§1.7.4",
            children: [{
                tag: "field", name: "CHGEVENT", xref: "cluster§1.7.4.1",
                details: "This feature shall indicate that the StateChange event is supported and will be generated every time " +
                    "the state changes."
            }]
        },

        {
            tag: "attribute", name: "StateValue", xref: "cluster§1.7.5.1",
            details: "This represents a boolean state." +
                "\n" +
                "The semantics of this boolean state are defined by the device type using this cluster. For example, " +
                "in a Contact Sensor device type, FALSE=open or no contact, TRUE=closed or contact."
        },

        {
            tag: "event", name: "StateChange", xref: "cluster§1.7.6.1",
            details: "If this event is supported, it shall be generated when the StateValue attribute changes.",
            children: [{
                tag: "field", name: "StateValue", xref: "cluster§1.7.6.1.1",
                details: "This field shall indicate the new value of the StateValue attribute."
            }]
        }
    ]
});
