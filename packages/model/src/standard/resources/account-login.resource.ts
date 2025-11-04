/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "AccountLogin", pics: "ALOGIN", xref: "cluster§6.2",

    details: "This cluster provides commands that facilitate user account login on a Content App or a node. For " +
        "example, a Content App running on a Video Player device, which is represented as an endpoint (see " +
        "Device Type Library document), can use this cluster to help make the user account on the Content App " +
        "match the user account on the Client." +
        "\n" +
        "Often a fabric administrator will facilitate commissioning of a Client (such as a Casting Video " +
        "Client), and invoke commands on the AccountLogin cluster on the Content App associated with that " +
        "client. Specifically:" +
        "\n" +
        "  1. GetSetupPIN in order to attempt to obtain the Passcode for commissioning." +
        "\n" +
        "  2. Login in order to let the Content App know that commissioning has completed. The Content App " +
        "     can use information provided in this command in order to determine the user account associated " +
        "     with the client, and potentially assume that user account." +
        "\n" +
        "  3. Logout in order to let the Content App know that client access has been removed, and " +
        "     potentially clear the current user account." +
        "\n" +
        "The cluster server for this cluster may be supported on each endpoint that represents a Content App " +
        "on a Video Player device." +
        "\n" +
        "See Device Type Library document for details of how a Content App, represented as an endpoint on the " +
        "Video Player device, may implement the cluster server for this cluster to simplify account login for " +
        "its users.",

    children: [
        {
            tag: "event", name: "LoggedOut", xref: "cluster§6.2.5.1",
            details: "This event can be used by the Content App to indicate that the current user has logged out. In " +
                "response to this event, the Fabric Admin shall remove access to this Content App by the specified " +
                "Node. If no Node is provided, then the Fabric Admin shall remove access to all non-Admin Nodes.",
            children: [{
                tag: "field", name: "Node", xref: "cluster§6.2.5.1.1",
                details: "This field shall provide the Node ID corresponding to the user account that has logged out, if that " +
                    "Node ID is available. If it is NOT available, this field shall NOT be present in the event."
            }]
        },

        {
            tag: "command", name: "GetSetupPin", xref: "cluster§6.2.4.1",

            details: "The purpose of this command is to determine if the active user account of the given Content App " +
                "matches the active user account of a given Commissionee, and when it does, return a Setup PIN which " +
                "can be used for password-authenticated session establishment (PASE) with the Commissionee." +
                "\n" +
                "For example, a Video Player with a Content App Platform may invoke this command on one of its " +
                "Content App endpoints to facilitate commissioning of a Phone App made by the same vendor as the " +
                "Content App. If the accounts match, then the Content App may return a Setup PIN that can be used by " +
                "the Video Player to commission the Phone App without requiring the user to physically input a Setup " +
                "PIN." +
                "\n" +
                "The account match is determined by the Content App using a method which is outside the scope of this " +
                "specification and will typically involve a central service which is in communication with both the " +
                "Content App and the Commissionee. The GetSetupPIN command is needed in order to provide the " +
                "Commissioner/Admin with a Setup PIN when this Commissioner/Admin is operated by a different vendor " +
                "from the Content App." +
                "\n" +
                "This method is used to facilitate Setup PIN exchange (for PASE) between Commissioner and " +
                "Commissionee when the same user account is active on both nodes. With this method, the Content App " +
                "satisfies proof of possession related to commissioning by requiring the same user account to be " +
                "active on both Commissionee and Content App, while the Commissioner/Admin ensures user consent by " +
                "prompting the user prior to invocation of the command." +
                "\n" +
                "Upon receipt of this command, the Content App checks if the account associated with the Temporary " +
                "Account Identifier sent by the client is the same account that is active on itself. If the accounts " +
                "are the same, then the Content App returns the GetSetupPIN Response which includes a Setup PIN that " +
                "may be used for PASE with the Commissionee." +
                "\n" +
                "The Temporary Account Identifier for a Commissionee may be populated with the Rotating ID field of " +
                "the client’s commissionable node advertisement (see Rotating Device Identifier section in " +
                "[MatterCore]) encoded as an octet string where the octets of the Rotating Device Identifier are " +
                "encoded as 2-character sequences by representing each octet’s value as a 2-digit hexadecimal number, " +
                "using uppercase letters." +
                "\n" +
                "The Setup PIN is a character string so that it can accommodate different future formats, including " +
                "alpha-numeric encodings. For a Commissionee it shall be populated with the Manual Pairing Code (see " +
                "Manual Pairing Code section in [MatterCore]) encoded as a string (11 characters) or the Passcode " +
                "portion of the Manual Pairing Code (when less than 11 characters)." +
                "\n" +
                "The server shall implement rate limiting to prevent brute force attacks. No more than 10 unique " +
                "requests in a 10 minute period shall be allowed; a command response status of FAILURE should sent " +
                "for additional commands received within the 10 minute period. Because access to this command is " +
                "limited to nodes with Admin-level access, and the user is prompted for consent prior to " +
                "Commissioning, there are in place multiple obstacles to successfully mounting a brute force attack. " +
                "A Content App that supports this command shall ensure that the Temporary Account Identifier used by " +
                "its clients is not valid for more than 10 minutes.",

            children: [{
                tag: "field", name: "TempAccountIdentifier", xref: "cluster§6.2.4.1.1",
                details: "This field shall specify the client’s Temporary Account Identifier. The length of this field shall " +
                    "be at least 16 characters to protect the account holder against password guessing attacks."
            }]
        },

        {
            tag: "command", name: "GetSetupPinResponse", xref: "cluster§6.2.4.2",
            details: "This message is sent in response to the GetSetupPIN command, and contains the Setup PIN, or null " +
                "when the account identified in the request does not match the active account of the running Content " +
                "App.",

            children: [{
                tag: "field", name: "SetupPin", xref: "cluster§6.2.4.2.1",

                details: "This field shall provide the Setup PIN as a text string at least 8 characters in length or empty " +
                    "string to indicate that the accounts do not match." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> Newer cluster clients should be aware that AccountLogin cluster version 1 specified an 11 digit " +
                    "  minimum length."
            }]
        },

        {
            tag: "command", name: "Login", xref: "cluster§6.2.4.3",

            details: "The purpose of this command is to allow the Content App to assume the user account of a given " +
                "Commissionee by leveraging the Setup PIN input by the user during the commissioning process." +
                "\n" +
                "For example, a Video Player with a Content App Platform may invoke this command on one of its " +
                "Content App endpoints after the commissioning has completed of a Phone App made by the same vendor " +
                "as the Content App. The Content App may determine whether the Temporary Account Identifier maps to " +
                "an account with a corresponding Setup PIN and, if so, it may automatically login to the account for " +
                "the corresponding user. The end result is that a user performs commissioning of a Phone App to a " +
                "Video Player by inputting the Setup PIN for the Phone App into the Video Player UX. Once " +
                "commissioning has completed, the Video Player invokes this command to allow the corresponding " +
                "Content App to assume the same user account as the Phone App." +
                "\n" +
                "The verification of Setup PIN for the given Temporary Account Identifier is determined by the " +
                "Content App using a method which is outside the scope of this specification and will typically " +
                "involve a central service which is in communication with both the Content App and the Commissionee. " +
                "Implementations of such a service should impose aggressive time outs for any mapping of Temporary " +
                "Account Identifier to Setup PIN in order to prevent accidental login due to delayed invocation." +
                "\n" +
                "Upon receipt, the Content App checks if the account associated with the client’s Temp Account " +
                "Identifier has a current active Setup PIN with the given value. If the Setup PIN is valid for the " +
                "user account associated with the Temp Account Identifier, then the Content App may make that user " +
                "account active." +
                "\n" +
                "The Temporary Account Identifier for a Commissionee may be populated with the Rotating ID field of " +
                "the client’s commissionable node advertisement encoded as an octet string where the octets of the " +
                "Rotating Device Identifier are encoded as 2-character sequences by representing each octet’s value " +
                "as a 2-digit hexadecimal number, using uppercase letters." +
                "\n" +
                "The Setup PIN for a Commissionee may be populated with the Manual Pairing Code encoded as a string " +
                "of decimal numbers (11 characters) or the Passcode portion of the Manual Pairing Code encoded as a " +
                "string of decimal numbers (8 characters)." +
                "\n" +
                "The server shall implement rate limiting to prevent brute force attacks. No more than 10 unique " +
                "requests in a 10 minute period shall be allowed; a command response status of FAILURE should sent " +
                "for additional commands received within the 10 minute period. Because access to this command is " +
                "limited to nodes with Admin-level access, and the user is involved when obtaining the Setup PIN, " +
                "there are in place multiple obstacles to successfully mounting a brute force attack. A Content App " +
                "that supports this command shall ensure that the Temporary Account Identifier used by its clients is " +
                "not valid for more than 10 minutes.",

            children: [
                {
                    tag: "field", name: "TempAccountIdentifier", xref: "cluster§6.2.4.3.1",
                    details: "This field shall specify the client’s temporary account identifier."
                },

                {
                    tag: "field", name: "SetupPin", xref: "cluster§6.2.4.3.2",

                    details: "This field shall provide the Setup PIN as a text string at least 8 characters in length." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> Newer cluster clients should be aware that AccountLogin cluster revision 1 specified an 11 digit " +
                        "  minimum length."
                },

                {
                    tag: "field", name: "Node", xref: "cluster§6.2.4.3.3",
                    details: "This optional field shall provide the Node ID of the Client. This field can be used by the Content " +
                        "App to keep track of Nodes which currently have access to it."
                }
            ]
        },

        {
            tag: "command", name: "Logout", xref: "cluster§6.2.4.4",
            details: "The purpose of this command is to instruct the Content App to clear the current user account. This " +
                "command SHOULD be used by clients of a Content App to indicate the end of a user session.",
            children: [{
                tag: "field", name: "Node", xref: "cluster§6.2.4.4.1",
                details: "This optional field shall provide the Node ID of the Client. This field can be used by the Content " +
                    "App to keep track of Nodes which currently have access to it."
            }]
        }
    ]
});
