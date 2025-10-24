/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Switch", classification: "application", pics: "SWTCH", xref: "cluster§1.13",

    details: "This cluster exposes interactions with a switch device, for the purpose of using those interactions " +
        "by other devices." +
        "\n" +
        "Two types of switch devices are supported: latching switch (e.g. rocker switch) and momentary switch " +
        "(e.g. push button), distinguished with their feature flags." +
        "\n" +
        "Interactions with the switch device are exposed as attributes (for the latching switch) and as " +
        "events (for both types of switches)." +
        "\n" +
        "An interested client may subscribe to these attributes/events and thus be informed of the " +
        "interactions, and can perform actions based on this, for example by sending commands to perform an " +
        "action such as controlling a light or a window shade.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§1.13.4",

            children: [
                {
                    tag: "field", name: "LS", xref: "cluster§1.13.4.1",
                    details: "This feature flag is for a switch that maintains its position after being pressed (or turned)."
                },
                {
                    tag: "field", name: "MS", xref: "cluster§1.13.4.2",
                    details: "This feature flag is for a switch that does not maintain its position after being pressed (or " +
                        "turned). After releasing, it goes back to its idle position."
                },
                {
                    tag: "field", name: "MSR", xref: "cluster§1.13.4.3",
                    details: "This feature flag is for a momentary switch that can distinguish and report release events."
                },
                {
                    tag: "field", name: "MSL", xref: "cluster§1.13.4.4",
                    details: "This feature flag is for a momentary switch that can distinguish and report long presses from short " +
                        "presses."
                },
                {
                    tag: "field", name: "MSM", xref: "cluster§1.13.4.5",
                    details: "This feature flag is for a momentary switch that can distinguish and report double press and " +
                        "potentially multiple presses with more events, such as triple press, etc."
                },
                {
                    tag: "field", name: "AS", xref: "cluster§1.13.4.6",
                    details: "This feature flag indicates simplified handling of events for multi-press-capable switches. See " +
                        "Section 1.13.8, “Sequence of events for MultiPress”."
                }
            ]
        },

        {
            tag: "attribute", name: "NumberOfPositions", xref: "cluster§1.13.5.1",
            details: "Indicates the maximum number of positions the switch has. Any kind of switch has a minimum of 2 " +
                "positions. Also see Section 1.13.10, “Multi Position Details” for the case NumberOfPositions>2."
        },

        {
            tag: "attribute", name: "CurrentPosition", xref: "cluster§1.13.5.2",
            details: "Indicates the position of the switch. The valid range is zero to NumberOfPositions - 1." +
                "\n" +
                "CurrentPosition value 0 shall be assigned to the default position of the switch: for example the " +
                "\"open\" state of a rocker switch, or the \"idle\" state of a push button switch."
        },

        {
            tag: "attribute", name: "MultiPressMax", xref: "cluster§1.13.5.3",

            details: "Indicates how many consecutive presses can be detected and reported by a momentary switch which " +
                "supports multi-press (MSM feature flag set)." +
                "\n" +
                "For example, a momentary switch supporting single press, double press and triple press, but not quad " +
                "press and beyond, would return the value 3." +
                "\n" +
                "When more than MultiPressMax presses are detected within a multi-press sequence:" +
                "\n" +
                "  • The server for cluster revision < 2 SHOULD generate a MultiPressComplete event with the " +
                "    TotalNumberOfPressesCounted field set to the value of the MultiPressMax attribute, and avoid " +
                "    generating any further InitialPress and MultiPressOngoing events until the switch has become " +
                "    fully idle (i.e. no longer in the process of counting presses within the multipress)." +
                "\n" +
                "  • The server for cluster revision >= 2 shall generate a MultiPressComplete event with the " +
                "    TotalNumberOfPressesCounted field set to zero (indicating an aborted sequence), and shall NOT " +
                "    generate any further InitialPress and MultiPressOngoing events until the switch has become fully " +
                "    idle (i.e. no longer in the process of counting presses within the multipress)." +
                "\n" +
                "This approach avoids unintentionally causing intermediate actions where there is a very long " +
                "sequence of presses beyond MultiPressMax that may be taken in account specially by switches (e.g. to " +
                "trigger special behavior such as factory reset for which generating events towards the client is not " +
                "appropriate)."
        },

        {
            tag: "event", name: "SwitchLatched", xref: "cluster§1.13.6.1",
            details: "This event shall be generated, when the latching switch is moved to a new position. It may have been " +
                "delayed by debouncing within the switch.",
            children: [{
                tag: "field", name: "NewPosition", xref: "cluster§1.13.6.1.1",
                details: "This field shall indicate the new value of the CurrentPosition attribute, i.e. after the move."
            }]
        },

        {
            tag: "event", name: "InitialPress", xref: "cluster§1.13.6.2",
            details: "This event shall be generated, when the momentary switch starts to be pressed (after debouncing).",
            children: [{
                tag: "field", name: "NewPosition", xref: "cluster§1.13.6.2.1",
                details: "This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed."
            }]
        },

        {
            tag: "event", name: "LongPress", xref: "cluster§1.13.6.3",

            details: "This event shall be generated when the momentary switch has been pressed for a \"long\" time. The time " +
                "interval constituting a \"long\" time is manufacturer-determined, since it depends on the switch " +
                "physics." +
                "\n" +
                "  • When the AS feature flag is set, this event:" +
                "\n" +
                "    ◦ shall NOT be generated during a multi-press sequence (since a long press is a separate cycle " +
                "      from any multi-press cycles);" +
                "\n" +
                "    ◦ shall only be generated after the first InitialPress following a MultiPressComplete when a " +
                "      long press is detected after the idle time." +
                "\n" +
                "  • Else, when the MSM feature flag is set, this event:" +
                "\n" +
                "    ◦ shall NOT be generated during a multi-press sequence (since a long press is a separate cycle " +
                "      from any multi-press cycles);" +
                "\n" +
                "    ◦ shall only be generated after the first InitialPress following a MultiPressComplete when a " +
                "      long press is detected after the idle time;" +
                "\n" +
                "    ◦ shall NOT be generated after a MultiPressOngoing event without an intervening " +
                "      MultiPressComplete event." +
                "\n" +
                "The above constraints imply that for a given activity detection cycle of a switch having MSM and/or " +
                "MSL feature flags set, the entire activity is either a single long press detection cycle of " +
                "(InitialPress, LongPress, LongRelease), or a single multi-press detection cycle (ending in " +
                "MultiPressComplete), where presses that would otherwise be reported as long presses are instead " +
                "reported as a counted press in the MultiPressComplete event, and as InitialPress/ShortRelease pairs " +
                "otherwise (where applicable)." +
                "\n" +
                "The rationale for this constraint is the ambiguity of interpretation of events when mixing long " +
                "presses and multi-press events.",

            children: [{
                tag: "field", name: "NewPosition", xref: "cluster§1.13.6.3.1",
                details: "This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed."
            }]
        },

        {
            tag: "event", name: "ShortRelease", xref: "cluster§1.13.6.4",

            details: "If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all, " +
                "since setting the Action Switch feature flag forbids the Momentary Switch ShortRelease (MSR) feature " +
                "flag from being set. Otherwise, the following paragraphs describe the situations where this event is " +
                "generated." +
                "\n" +
                "This event shall be generated, when the momentary switch has been released (after debouncing)." +
                "\n" +
                "  • If the server has the Momentary Switch LongPress (MSL) feature flag set, then this event shall " +
                "    be generated when the switch is released if no LongPress event had been generated since the " +
                "    previous InitialPress event." +
                "\n" +
                "  • If the server does not have the Momentary Switch LongPress (MSL) feature flag set, this event " +
                "    shall be generated when the switch is released - even when the switch was pressed for a long " +
                "    time." +
                "\n" +
                "  • Also see Section 1.13.7, “Sequence of generated events”.",

            children: [{
                tag: "field", name: "PreviousPosition", xref: "cluster§1.13.6.4.1",
                details: "This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to " +
                    "release."
            }]
        },

        {
            tag: "event", name: "LongRelease", xref: "cluster§1.13.6.5",
            details: "This event shall be generated, when the momentary switch has been released (after debouncing) and " +
                "after having been pressed for a long time, i.e. this event shall be generated when the switch is " +
                "released if a LongPress event has been generated since the previous InitialPress event. Also see " +
                "Section 1.13.7, “Sequence of generated events”.",
            children: [{
                tag: "field", name: "PreviousPosition", xref: "cluster§1.13.6.5.1",
                details: "This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to " +
                    "release."
            }]
        },

        {
            tag: "event", name: "MultiPressOngoing", xref: "cluster§1.13.6.6",
            details: "If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all. " +
                "Otherwise, the following paragraphs describe the situations where this event is generated." +
                "\n" +
                "This event shall be generated to indicate how many times the momentary switch has been pressed in a " +
                "multi-press sequence, during that sequence. See Section 1.13.8, “Sequence of events for MultiPress”.",

            children: [
                {
                    tag: "field", name: "NewPosition", xref: "cluster§1.13.6.6.1",
                    details: "This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed."
                },

                {
                    tag: "field", name: "CurrentNumberOfPressesCounted", xref: "cluster§1.13.6.6.2",

                    details: "This field shall contain:" +
                        "\n" +
                        "  • a value of 2 when the second press of a multi-press sequence has been detected," +
                        "\n" +
                        "  • a value of 3 when the third press of a multi-press sequence has been detected," +
                        "\n" +
                        "  • a value of N when the Nth press of a multi-press sequence has been detected."
                }
            ]
        },

        {
            tag: "event", name: "MultiPressComplete", xref: "cluster§1.13.6.7",

            details: "This event shall be generated to indicate how many times the momentary switch has been pressed in a " +
                "multi-press sequence, after it has been detected that the sequence has ended. See Section 1.13.8, " +
                "“Sequence of events for MultiPress”." +
                "\n" +
                "The PreviousPosition field shall indicate the previous value of the CurrentPosition attribute, i.e. " +
                "just prior to release." +
                "\n" +
                "The TotalNumberOfPressesCounted field shall contain:" +
                "\n" +
                "  • a value of 0 when there was an aborted multi-press sequence, where the number of presses goes " +
                "    beyond MultiPressMax presses," +
                "\n" +
                "  • a value of 1 when there was exactly one press in a multi-press sequence (and the sequence has " +
                "    ended), i.e. there was no double press (or more)," +
                "\n" +
                "  • a value of 2 when there were exactly two presses in a multi-press sequence (and the sequence has " +
                "    ended)," +
                "\n" +
                "  • a value of 3 when there were exactly three presses in a multi-press sequence (and the sequence " +
                "    has ended)," +
                "\n" +
                "  • a value of N when there were exactly N presses in a multi-press sequence (and the sequence has " +
                "    ended)." +
                "\n" +
                "    > [!NOTE]" +
                "\n" +
                "    > The introduction of TotalNumberOfPressesCounted supporting the value 0 may impact clients of " +
                "      switches using cluster revision 1 since such servers would not use this value of " +
                "      TotalNumberOfPressesCounted to indicate an aborted sequence. Clients SHOULD always act using " +
                "      the TotalNumberOfPressesCounted field taken into account since for values from 1 to " +
                "      MultiPressMax, the user action that led to the event was different depending on the count."
        }
    ]
});
