/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Identify", classification: "endpoint", pics: "I", xref: "cluster§1.2",

    details: "This cluster supports an endpoint identification state (e.g., flashing a light), that indicates to " +
        "an observer (e.g., an installer) which of several nodes and/or endpoints it is. It also supports a " +
        "multicast request that any endpoint that is identifying itself to respond to the initiator." +
        "\n" +
        "The state of this cluster may be shared on more than one endpoint on a node." +
        "\n" +
        "For Example: Two endpoints on a single node, one a temperature sensor, and one a humidity sensor, " +
        "may both share the same cluster instance and therefore identification state (e.g. single LED on the " +
        "node).",

    children: [
        {
            tag: "attribute", name: "IdentifyTime", xref: "cluster§1.2.5.1",

            details: "Indicates the remaining length of time, in seconds, that the endpoint will continue to identify " +
                "itself." +
                "\n" +
                "If this attribute is set to a value other than 0 then the device shall enter its identification " +
                "state, in order to indicate to an observer which of several nodes and/or endpoints it is. It is " +
                "recommended that this state consists of flashing a light with a period of 0.5 seconds. The " +
                "IdentifyTime attribute shall be decremented every second while in this state." +
                "\n" +
                "If this attribute reaches or is set to the value 0 then the device shall terminate its " +
                "identification state." +
                "\n" +
                "Changes to this attribute shall only be marked as reportable in the following cases:" +
                "\n" +
                "  • When it changes from 0 to any other value and vice versa, or" +
                "\n" +
                "  • When it is written by a client, or" +
                "\n" +
                "  • When the value is set by an Identify command." +
                "\n" +
                "Since this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on " +
                "the reporting of this attribute in order to keep track of the remaining duration."
        },

        {
            tag: "attribute", name: "IdentifyType", xref: "cluster§1.2.5.2",
            details: "Indicates how the identification state is presented to the user." +
                "\n" +
                "This attribute shall contain one of the values defined in IdentifyTypeEnum. The value None shall NOT " +
                "be used if the device is capable of presenting its identification state using one of the other " +
                "methods defined in IdentifyTypeEnum."
        },

        {
            tag: "command", name: "Identify", xref: "cluster§1.2.6.1",
            details: "This command starts or stops the receiving device identifying itself."
        },

        {
            tag: "command", name: "TriggerEffect", xref: "cluster§1.2.6.2",

            details: "This command allows the support of feedback to the user, such as a certain light effect. It is used " +
                "to allow an implementation to provide visual feedback to the user under certain circumstances such " +
                "as a color light turning green when it has successfully connected to a network. The use of this " +
                "command and the effects themselves are entirely up to the implementer to use whenever a visual " +
                "feedback is useful but it is not the same as and does not replace the identify mechanism used during " +
                "commissioning.",

            children: [
                {
                    tag: "field", name: "EffectIdentifier", xref: "cluster§1.2.6.2.1",

                    details: "This field shall indicate the identify effect to use and shall contain one of the non-reserved " +
                        "values in EffectIdentifierEnum." +
                        "\n" +
                        "All values of the EffectIdentifierEnum shall be supported. Implementors may deviate from the example " +
                        "light effects in EffectIdentifierEnum, but they SHOULD indicate during testing how they handle each " +
                        "effect."
                },

                {
                    tag: "field", name: "EffectVariant", xref: "cluster§1.2.6.2.2",
                    details: "This field shall indicate which variant of the effect, indicated in the EffectIdentifier field, " +
                        "SHOULD be triggered. If a device does not support the given variant, it shall use the default " +
                        "variant. This field shall contain one of the values in EffectVariantEnum."
                }
            ]
        },

        {
            tag: "datatype", name: "IdentifyTypeEnum", xref: "cluster§1.2.4.1",

            children: [
                { tag: "field", name: "None", description: "No presentation." },
                { tag: "field", name: "LightOutput", description: "Light output of a lighting product." },
                { tag: "field", name: "VisibleIndicator", description: "Typically a small LED." },
                { tag: "field", name: "Display", description: "Presentation will be visible on display screen." },
                {
                    tag: "field", name: "Actuator",
                    description: "Presentation will be conveyed by actuator functionality such as through a window blind operation or in-wall relay."
                }
            ]
        },

        {
            tag: "datatype", name: "EffectIdentifierEnum", xref: "cluster§1.2.4.2",

            children: [
                { tag: "field", name: "Blink", description: "e.g., Light is turned on/off once." },
                {
                    tag: "field", name: "Breathe",
                    description: "e.g., Light is turned on/off over 1 second and repeated 15 times."
                },
                {
                    tag: "field", name: "Okay",
                    description: "e.g., Colored light turns green for 1 second; non-colored light flashes twice."
                },
                {
                    tag: "field", name: "ChannelChange",
                    description: "e.g., Colored light turns orange for 8 seconds; non-colored light switches to the maximum brightness for 0.5s and then minimum brightness for 7.5s."
                },
                {
                    tag: "field", name: "FinishEffect",
                    description: "Complete the current effect sequence before terminating. e.g., if in the middle of a breathe effect (as above), first complete the current 1s breathe effect and then terminate the effect."
                },
                { tag: "field", name: "StopEffect", description: "Terminate the effect as soon as possible." }
            ]
        },

        {
            tag: "datatype", name: "EffectVariantEnum", xref: "cluster§1.2.4.3",
            children: [{ tag: "field", name: "Default", description: "Indicates the default effect is used" }]
        }
    ]
});
