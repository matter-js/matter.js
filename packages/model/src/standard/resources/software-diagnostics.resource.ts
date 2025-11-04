/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "SoftwareDiagnostics", pics: "DGSW", xref: "core§11.13",
    details: "The Software Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that " +
        "may be used by a Node to assist a user or Administrator in diagnosing potential problems. The " +
        "Software Diagnostics Cluster attempts to centralize all metrics that are relevant to the software " +
        "that may be running on a Node.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.13.4",
            children: [{
                tag: "field", name: "WTRMRK",
                details: "Node makes available the metrics for high watermark related to memory consumption."
            }]
        },

        {
            tag: "attribute", name: "ThreadMetrics", xref: "core§11.13.6.1",
            details: "This attribute shall be a list of ThreadMetricsStruct structs. Each active thread on the Node shall " +
                "be represented by a single entry within the ThreadMetrics attribute."
        },
        {
            tag: "attribute", name: "CurrentHeapFree", xref: "core§11.13.6.2",
            details: "Indicates the current amount of heap memory, in bytes, that are free for allocation. The effective " +
                "amount may be smaller due to heap fragmentation or other reasons."
        },
        {
            tag: "attribute", name: "CurrentHeapUsed", xref: "core§11.13.6.3",
            details: "Indicates the current amount of heap memory, in bytes, that is being used."
        },
        {
            tag: "attribute", name: "CurrentHeapHighWatermark", xref: "core§11.13.6.4",
            details: "Indicates the maximum amount of heap memory, in bytes, that has been used by the Node. This value " +
                "shall only be reset upon a Node reboot or upon receiving of the ResetWatermarks command."
        },

        {
            tag: "event", name: "SoftwareFault", xref: "core§11.13.8.1",
            details: "This Event shall be generated when a software fault occurs on the Node.",

            children: [
                {
                    tag: "field", name: "Id", xref: "core§11.13.8.1.1",
                    details: "This field shall be set to the ID of the software thread in which the last software fault occurred."
                },
                {
                    tag: "field", name: "Name", xref: "core§11.13.8.1.2",
                    details: "This field shall be set to a manufacturer-specified name or prefix of the software thread in which " +
                        "the last software fault occurred."
                },

                {
                    tag: "field", name: "FaultRecording", xref: "core§11.13.8.1.3",
                    details: "This field shall be a manufacturer-specified payload intended to convey information to assist in " +
                        "further diagnosing or debugging a software fault. The FaultRecording field may be used to convey " +
                        "information such as, but not limited to, thread backtraces or register contents."
                }
            ]
        },

        {
            tag: "command", name: "ResetWatermarks", xref: "core§11.13.7.1",

            details: "This command is used to reset the high watermarks for heap and stack memory." +
                "\n" +
                "Receipt of this command shall reset the following values which track high and lower watermarks:" +
                "\n" +
                "  • The StackFreeMinimum field of the ThreadMetrics attribute" +
                "\n" +
                "  • The CurrentHeapHighWatermark attribute" +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "On receipt of this command, the Node shall make the following modifications to attributes it " +
                "supports:" +
                "\n" +
                "If implemented, the server shall set the value of the CurrentHeapHighWatermark attribute to the " +
                "value of the CurrentHeapUsed attribute." +
                "\n" +
                "If implemented, the server shall set the value of the StackFreeMinimum field for every thread to the " +
                "value of the corresponding thread’s StackFreeCurrent field."
        },

        {
            tag: "datatype", name: "ThreadMetricsStruct", xref: "core§11.13.5.1",

            children: [
                {
                    tag: "field", name: "Id", xref: "core§11.13.5.1.1",
                    details: "The Id field shall be a server-assigned per-thread unique ID that is constant for the duration of " +
                        "the thread. Efforts SHOULD be made to avoid reusing ID values when possible."
                },
                {
                    tag: "field", name: "Name", xref: "core§11.13.5.1.2",
                    details: "The Name field shall be set to a vendor defined name or prefix of the software thread that is static " +
                        "for the duration of the thread."
                },
                {
                    tag: "field", name: "StackFreeCurrent", xref: "core§11.13.5.1.3",
                    details: "The StackFreeCurrent field shall indicate the current amount of stack memory, in bytes, that are not " +
                        "being utilized on the respective thread."
                },

                {
                    tag: "field", name: "StackFreeMinimum", xref: "core§11.13.5.1.4",
                    details: "The StackFreeMinimum field shall indicate the minimum amount of stack memory, in bytes, that has " +
                        "been available at any point between the current time and this attribute being reset or initialized " +
                        "on the respective thread. This value shall only be reset upon a Node reboot or upon receiving of the " +
                        "ResetWatermarks command."
                },

                {
                    tag: "field", name: "StackSize", xref: "core§11.13.5.1.5",
                    details: "The StackSize field shall indicate the amount of stack memory, in bytes, that has been allocated for " +
                        "use by the respective thread."
                }
            ]
        }
    ]
});
