/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Messages", pics: "MESS", xref: "cluster§1.16",
    details: "This cluster provides an interface for passing messages to be presented by a device.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§1.16.4",

            children: [
                {
                    tag: "field", name: "CONF", xref: "cluster§1.16.4.1",
                    details: "This feature shall indicate that the device can get confirmation from a user that the message was " +
                        "received."
                },
                {
                    tag: "field", name: "RESP", xref: "cluster§1.16.4.2",
                    details: "This feature shall indicate that the device is capable of presenting a list of responses to the user " +
                        "and recording the user’s choice of response."
                },
                {
                    tag: "field", name: "RPLY", xref: "cluster§1.16.4.3",
                    details: "This feature shall indicate that the device is capable of collecting a free-form text response to a " +
                        "message."
                },

                {
                    tag: "field", name: "PROT", xref: "cluster§1.16.4.4",
                    details: "This feature shall indicate that the device is capable of requiring the user to authenticate before " +
                        "viewing a message; e.g. entering a PIN or password before viewing a message with billing " +
                        "information."
                }
            ]
        },

        {
            tag: "attribute", name: "Messages", xref: "cluster§1.16.6.1",
            details: "Indicates a list of queued messages." +
                "\n" +
                "In addition to filtering based upon fabric, to preserve user privacy, the server may further limit " +
                "the set of messages returned in a read request. At minimum, the server shall return to a client " +
                "those messages that the client itself created/submitted."
        },

        {
            tag: "attribute", name: "ActiveMessageIDs", xref: "cluster§1.16.6.2",
            details: "Indicates a list of the MessageIDs of the Messages currently being presented. If this list is empty, " +
                "no messages are currently being presented." +
                "\n" +
                "This list shall NOT be fabric-scoped; it shall contain MessageIDs for all Messages being presented, " +
                "no matter what fabric the client that queued them is on."
        },

        {
            tag: "event", name: "MessageQueued", xref: "cluster§1.16.8.1",
            details: "This event shall be generated when a message is added to the messages attribute.",
            children: [{
                tag: "field", name: "MessageId", xref: "cluster§1.16.8.1.1",
                details: "This field shall indicate the MessageID for newly added message."
            }]
        },

        {
            tag: "event", name: "MessagePresented", xref: "cluster§1.16.8.2",
            details: "This event shall be generated when the message is presented to the user.",
            children: [{
                tag: "field", name: "MessageId", xref: "cluster§1.16.8.2.1",
                details: "This field shall indicate the MessageID for the message being presented."
            }]
        },

        {
            tag: "event", name: "MessageComplete", xref: "cluster§1.16.8.3",
            details: "This event shall be generated when the message is confirmed by the user, or when the Duration field " +
                "of the message has elapsed without confirmation.",

            children: [
                {
                    tag: "field", name: "MessageId", xref: "cluster§1.16.8.3.1",
                    details: "This field shall indicate the MessageID for the message being confirmed."
                },
                {
                    tag: "field", name: "ResponseId", xref: "cluster§1.16.8.3.2",
                    details: "This field shall indicate the MessageResponseID selected by the user. If there was no response " +
                        "before the Duration field of the message has elapsed, this field shall be null."
                },
                {
                    tag: "field", name: "Reply", xref: "cluster§1.16.8.3.3",
                    details: "This field shall indicate a user-provided reply to the message. If there was no reply, or the " +
                        "message did not have the ReplyRequired bit set, this field shall be null."
                }
            ]
        },

        {
            tag: "command", name: "PresentMessagesRequest", xref: "cluster§1.16.7.1",

            details: "Upon receipt, this shall cause the message in the passed fields to be appended to the Messages " +
                "attribute." +
                "\n" +
                "If appending the message would cause the number of messages to be greater than the capacity of the " +
                "list, the device shall NOT append any message to Messages, and shall return a status code of " +
                "RESOURCE_EXHAUSTED." +
                "\n" +
                "When displaying a message in response to this command, an indication (ex. visual) of the origin node " +
                "of the command shall be provided. This could be in the form of a friendly name label which uniquely " +
                "identifies the node to the user. This friendly name label is typically assigned by the Matter Admin " +
                "at the time of commissioning and, when it’s a device, is often editable by the user. It might be a " +
                "combination of a company name and friendly name, for example, ”Acme” or “Acme Streaming Service on " +
                "Alice’s Phone”." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> It is currently not specified where the friendly name label can be found on the node, meaning that " +
                "  clients SHOULD NOT rely on a certain method they happen to observe in a particular server " +
                "  instance, since other instances could employ a different method." +
                "\n" +
                "The device SHOULD make it possible for the user to view which nodes have access to this cluster and " +
                "to individually remove privileges for each node.",

            children: [
                {
                    tag: "field", name: "MessageId", xref: "cluster§1.16.7.1.1",
                    details: "This field shall indicate a globally unique ID for this message. See MessageID."
                },
                {
                    tag: "field", name: "Priority", xref: "cluster§1.16.7.1.2",
                    details: "This field shall indicate the priority level for this message. See Priority."
                },
                {
                    tag: "field", name: "MessageControl", xref: "cluster§1.16.7.1.3",
                    details: "This field shall indicate control information related to the message. See MessageControl."
                },
                {
                    tag: "field", name: "StartTime", xref: "cluster§1.16.7.1.4",
                    details: "This field shall indicate the time in UTC at which the message becomes available to be presented. A " +
                        "null value shall indicate \"now.\" See StartTime."
                },
                {
                    tag: "field", name: "Duration", xref: "cluster§1.16.7.1.5",
                    details: "This field shall indicate the amount of time, in milliseconds, after the StartTime during which the " +
                        "message is available to be presented. A null value shall indicate \"until changed\". See Duration."
                },
                {
                    tag: "field", name: "MessageText", xref: "cluster§1.16.7.1.6",
                    details: "This field shall indicate a string containing the message to be presented. See MessageText."
                },

                {
                    tag: "field", name: "Responses", xref: "cluster§1.16.7.1.7",

                    details: "This field shall indicate a list of potential responses to the message. The entries in this list " +
                        "shall have unique values of MessageResponseID." +
                        "\n" +
                        "If the ResponseRequired bit is set on the message but this list is empty, the device shall provide a " +
                        "generic acknowledgement button, e.g. \"OK\"." +
                        "\n" +
                        "If the ResponseRequired bit is not set on the message, this list shall be ignored. See Responses."
                }
            ]
        },

        {
            tag: "command", name: "CancelMessagesRequest", xref: "cluster§1.16.7.2",

            children: [{
                tag: "field", name: "MessageIDs", xref: "cluster§1.16.7.2.1",

                details: "This field shall indicate the MessageIDs for the messages being cancelled." +
                    "\n" +
                    "Cancelling a message shall cause it to be removed from Messages, cause its MessageID to be removed " +
                    "from ActiveMessageIDs and cause any active presentation of the message to cease." +
                    "\n" +
                    "Message IDs in this command that indicate messages that do not exist in Messages, or that are not " +
                    "scoped to the fabric of the sender, shall be ignored."
            }]
        },

        {
            tag: "datatype", name: "MessageID", xref: "cluster§1.16.5.1",
            details: "This data type is an octstr of fixed length 16, containing the binary encoding of a UUID as " +
                "specified in RFC 4122."
        },

        {
            tag: "datatype", name: "MessageControlBitmap", xref: "cluster§1.16.5.2",
            details: "This data type is derived from map16, and indicates control information related to a message.",

            children: [
                {
                    tag: "field", name: "ConfirmationRequired", description: "Message requires confirmation from user",
                    xref: "cluster§1.16.5.2.1",
                    details: "This bit shall indicate that the message originator requests a confirmation of receipt by the user. " +
                        "If confirmation is required, the device SHOULD present the message until it is either confirmed by " +
                        "the user selecting a confirmation option, or the message expires."
                },

                {
                    tag: "field", name: "ResponseRequired", description: "Message requires response from user",
                    xref: "cluster§1.16.5.2.2",
                    details: "This bit shall indicate that a MessagePresented event SHOULD be generated based on the response of " +
                        "the user to the message."
                },

                {
                    tag: "field", name: "ReplyMessage", description: "Message supports reply message from user",
                    xref: "cluster§1.16.5.2.3",
                    details: "This bit shall indicate that a free-form user reply is to be included in the confirmation of " +
                        "receipt."
                },

                {
                    tag: "field", name: "MessageConfirmed", description: "Message has already been confirmed",
                    xref: "cluster§1.16.5.2.4",
                    details: "This bit shall indicate the current confirmation state of a message, which is useful in the event " +
                        "that there are multiple Messages cluster client devices on a network."
                },

                {
                    tag: "field", name: "MessageProtected", description: "Message required PIN/password protection",
                    xref: "cluster§1.16.5.2.5",
                    details: "This bit shall indicate that user authentication (e.g. by password or PIN) is required before " +
                        "viewing a message."
                }
            ]
        },

        {
            tag: "datatype", name: "FutureMessagePreferenceEnum", xref: "cluster§1.16.5.3",
            details: "A display device may include this preference in the MessageComplete event as a hint to clients about " +
                "how to handle future similar messages.",

            children: [
                { tag: "field", name: "Allowed", description: "Similar messages are allowed" },
                { tag: "field", name: "Increased", description: "Similar messages should be sent more often" },
                { tag: "field", name: "Reduced", description: "Similar messages should be sent less often" },
                { tag: "field", name: "Disallowed", description: "Similar messages should not be sent" },
                { tag: "field", name: "Banned", description: "No further messages should be sent" }
            ]
        },

        {
            tag: "datatype", name: "MessagePriorityEnum", xref: "cluster§1.16.5.4",
            details: "Priority SHOULD be used to decide which messages to show when the number of eligible messages is " +
                "larger than the device’s capacity to present them.",

            children: [
                { tag: "field", name: "Low", description: "Message to be transferred with a low level of importance" },
                {
                    tag: "field", name: "Medium",
                    description: "Message to be transferred with a medium level of importance"
                },
                {
                    tag: "field", name: "High",
                    description: "Message to be transferred with a high level of importance"
                },
                {
                    tag: "field", name: "Critical",
                    description: "Message to be transferred with a critical level of importance"
                }
            ]
        },

        {
            tag: "datatype", name: "MessageStruct", xref: "cluster§1.16.5.5",
            details: "This represents a single message.",

            children: [
                {
                    tag: "field", name: "MessageId", xref: "cluster§1.16.5.5.1",
                    details: "This field shall indicate a globally unique ID for this message."
                },
                {
                    tag: "field", name: "Priority", xref: "cluster§1.16.5.5.2",
                    details: "This field shall indicate the priority level for this message."
                },
                {
                    tag: "field", name: "MessageControl", xref: "cluster§1.16.5.5.3",
                    details: "This field shall indicate control information related to the message."
                },
                {
                    tag: "field", name: "StartTime", xref: "cluster§1.16.5.5.4",
                    details: "This field shall indicate the time in UTC at which the message becomes available to be presented. A " +
                        "null value shall indicate \"now.\""
                },
                {
                    tag: "field", name: "Duration", xref: "cluster§1.16.5.5.5",
                    details: "This field shall indicate the amount of time, in milliseconds, after the StartTime during which the " +
                        "message is available to be presented. A null value shall indicate \"until changed\"."
                },
                {
                    tag: "field", name: "MessageText", xref: "cluster§1.16.5.5.6",
                    details: "This field shall indicate a string containing the message to be presented."
                },

                {
                    tag: "field", name: "Responses", xref: "cluster§1.16.5.5.7",

                    details: "This field shall indicate a list of potential responses to the message. The entries in this list " +
                        "shall have unique values of MessageResponseID." +
                        "\n" +
                        "If the ResponseRequired bit is set on the message but this list is empty, the device shall provide a " +
                        "generic acknowledgement button, e.g. \"OK\"." +
                        "\n" +
                        "If the ResponseRequired bit is not set on the message, this list shall be ignored."
                }
            ]
        },

        {
            tag: "datatype", name: "MessageResponseOptionStruct", xref: "cluster§1.16.5.6",
            details: "This represents a possible response to a message.",

            children: [
                {
                    tag: "field", name: "MessageResponseId", xref: "cluster§1.16.5.6.1",
                    details: "This field shall indicate a unique unsigned 32-bit number identifier for this message response " +
                        "option."
                },
                {
                    tag: "field", name: "Label", xref: "cluster§1.16.5.6.2",
                    details: "This field shall indicate the text for this option; e.g. \"Yes\", \"No\", etc."
                }
            ]
        }
    ]
});
