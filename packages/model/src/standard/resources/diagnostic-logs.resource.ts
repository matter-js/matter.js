/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "DiagnosticLogs", pics: "DLOG", xref: "core§11.11",
    details: "This Cluster supports an interface to a Node. It provides commands for retrieving unstructured " +
        "diagnostic logs from a Node that may be used to aid in diagnostics. It will often be the case that " +
        "unstructured diagnostic logs will be Node-wide and not specific to any subset of Endpoints. When " +
        "present, this Cluster shall be implemented once for the Node. The Node SHOULD also implement the BDX " +
        "Initiator and BDX Sender roles as defined in the BDX Protocol.",

    children: [
        {
            tag: "command", name: "RetrieveLogsRequest", xref: "core§11.11.5.1",
            details: "Reception of this command starts the process of retrieving diagnostic logs from a Node.",

            children: [
                {
                    tag: "field", name: "Intent", xref: "core§11.11.5.1.1",
                    details: "This field shall indicate why the diagnostic logs are being retrieved from the Node. A Node may " +
                        "utilize this field to selectively determine the logs to transfer."
                },

                {
                    tag: "field", name: "RequestedProtocol", xref: "core§11.11.5.1.2",

                    details: "This field shall be used to indicate how the log transfer is to be realized. If the field is set to " +
                        "BDX, then if the receiving Node supports BDX it shall attempt to use BDX to transfer any potential " +
                        "diagnostic logs; if the receiving Node does not support BDX then the Node shall follow the " +
                        "requirements defined for a TransferProtocolEnum of ResponsePayload. If this field is set to " +
                        "ResponsePayload the receiving Node shall only utilize the LogContent field of the " +
                        "RetrieveLogsResponse command to transfer diagnostic log information."
                },

                {
                    tag: "field", name: "TransferFileDesignator", xref: "core§11.11.5.1.3",

                    details: "This field shall be present if the RequestedProtocol is BDX. The TransferFileDesignator shall be set " +
                        "as the File Designator of the BDX transfer if initiated." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "On receipt of this command, the Node shall respond with a RetrieveLogsResponse command." +
                        "\n" +
                        "If the RequestedProtocol is set to BDX the Node SHOULD immediately realize the RetrieveLogsResponse " +
                        "command by initiating a BDX Transfer, sending a BDX SendInit message with the File Designator field " +
                        "of the message set to the value of the TransferFileDesignator field of the RetrieveLogsRequest. On " +
                        "reception of a BDX SendAccept message the Node shall send a RetrieveLogsResponse command with a " +
                        "Status field set to Success and proceed with the log transfer over BDX. If a failure StatusReport is " +
                        "received in response to the SendInit message, the Node shall send a RetrieveLogsResponse command " +
                        "with a Status of Denied. In the case where the Node is able to fit the entirety of the requested " +
                        "logs within the LogContent field, the Status field of the RetrieveLogsResponse shall be set to " +
                        "Exhausted and a BDX session shall NOT be initiated." +
                        "\n" +
                        "If the RequestedProtocol is set to BDX and either the Node does not support BDX or it is not " +
                        "possible for the Node to establish a BDX session, then the Node shall utilize the LogContent field " +
                        "of the RetrieveLogsResponse command to transfer as much of the current logs as it can fit within the " +
                        "response, and the Status field of the RetrieveLogsResponse shall be set to Exhausted." +
                        "\n" +
                        "If the RequestedProtocol is set to ResponsePayload the Node shall utilize the LogContent field of " +
                        "the RetrieveLogsResponse command to transfer as much of the current logs as it can fit within the " +
                        "response, and a BDX session shall NOT be initiated." +
                        "\n" +
                        "If the RequestedProtocol is set to BDX and there is no TransferFileDesignator the command shall fail " +
                        "with a Status Code of INVALID_COMMAND." +
                        "\n" +
                        "If the Intent and/or the RequestedProtocol arguments contain invalid (out of range) values the " +
                        "command shall fail with a Status Code of INVALID_COMMAND."
                }
            ]
        },

        {
            tag: "command", name: "RetrieveLogsResponse", xref: "core§11.11.5.2",
            details: "This shall be generated as a response to the RetrieveLogsRequest. The data for this command is shown " +
                "in the following.",

            children: [
                {
                    tag: "field", name: "Status", xref: "core§11.11.5.2.1",
                    details: "This field shall indicate the result of an attempt to retrieve diagnostic logs."
                },

                {
                    tag: "field", name: "LogContent", xref: "core§11.11.5.2.2",
                    details: "This field shall be included in the command if the Status field has a value of Success or Exhausted. " +
                        "A Node SHOULD utilize this field to transfer the newest diagnostic log entries. This field shall be " +
                        "empty if BDX is requested and the Status field has a value of Success."
                },

                {
                    tag: "field", name: "UtcTimeStamp", xref: "core§11.11.5.2.3",
                    details: "This field SHOULD be included in the command if the Status field has a value of Success and the Node " +
                        "maintains a wall clock. When included, the UTCTimeStamp field shall contain the value of the oldest " +
                        "log entry in the diagnostic logs that are being transferred."
                },

                {
                    tag: "field", name: "TimeSinceBoot", xref: "core§11.11.5.2.4",
                    details: "This field SHOULD be included in the command if the Status field has a value of Success. When " +
                        "included, the TimeSinceBoot field shall contain the time of the oldest log entry in the diagnostic " +
                        "logs that are being transferred represented by the number of microseconds since the last time the " +
                        "Node went through a reboot."
                }
            ]
        },

        {
            tag: "datatype", name: "IntentEnum", xref: "core§11.11.4.1",

            children: [
                {
                    tag: "field", name: "EndUserSupport", description: "Logs to be used for end-user support",
                    xref: "core§11.11.4.1.1",
                    details: "shall indicate that the purpose of the log request is to retrieve logs for the intention of " +
                        "providing support to an end-user."
                },

                {
                    tag: "field", name: "NetworkDiag", description: "Logs to be used for network diagnostics",
                    xref: "core§11.11.4.1.2",
                    details: "shall indicate that the purpose of the log request is to diagnose the network(s) for which the Node " +
                        "is currently commissioned (and/or connected) or has previously been commissioned (and/or connected)."
                },

                {
                    tag: "field", name: "CrashLogs", description: "Obtain crash logs from the Node",
                    xref: "core§11.11.4.1.3",
                    details: "shall indicate that the purpose of the log request is to retrieve any crash logs that may be present " +
                        "on a Node."
                }
            ]
        },

        {
            tag: "datatype", name: "StatusEnum", xref: "core§11.11.4.2",

            children: [
                {
                    tag: "field", name: "Success", description: "Successful transfer of logs", xref: "core§11.11.4.2.1",
                    details: "shall be used if diagnostic logs will be or are being transferred."
                },

                {
                    tag: "field", name: "Exhausted", description: "All logs has been transferred",
                    xref: "core§11.11.4.2.2",
                    details: "shall be used when a BDX session is requested, however, all available logs were provided in a " +
                        "LogContent field."
                },

                {
                    tag: "field", name: "NoLogs", description: "No logs of the requested type available",
                    xref: "core§11.11.4.2.3",
                    details: "shall be used if the Node does not currently have any diagnostic logs of the requested type (Intent) " +
                        "to transfer."
                },

                {
                    tag: "field", name: "Busy", description: "Unable to handle request, retry later",
                    xref: "core§11.11.4.2.4",
                    details: "shall be used if the Node is unable to handle the request (e.g. in the process of another transfer) " +
                        "and the Client SHOULD re-attempt the request later."
                },

                {
                    tag: "field", name: "Denied", description: "The request is denied, no logs being transferred",
                    xref: "core§11.11.4.2.5",
                    details: "shall be used if the Node is denying the current transfer of diagnostic logs for any reason."
                }
            ]
        },

        {
            tag: "datatype", name: "TransferProtocolEnum", xref: "core§11.11.4.3",

            children: [
                {
                    tag: "field", name: "ResponsePayload", description: "Logs to be returned as a response",
                    xref: "core§11.11.4.3.1",
                    details: "shall be used by a Client to request that logs are transferred using the LogContent attribute of the " +
                        "response"
                },

                {
                    tag: "field", name: "Bdx", description: "Logs to be returned using BDX", xref: "core§11.11.4.3.2",
                    details: "shall be used by a Client to request that logs are transferred using BDX as defined in BDX Protocol"
                }
            ]
        }
    ]
});
