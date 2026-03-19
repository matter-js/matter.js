/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "StreamUsageEnum", xref: "cluster§11.1.3.1",
    details: "This data type provides an enumeration of the different usages of streams supported by the camera. " +
        "This categorization indicates the use-case of a specific stream and thus factors into its priority " +
        "in terms of resource allocation by the camera. For example, a Recording stream may be given higher " +
        "priority than a LiveView stream to maintain a higher quality in terms of resolution, bitrate, etc.",

    children: [
        {
            tag: "field", name: "Internal", description: "Internal video stream.", xref: "cluster§11.1.3.1.1",
            details: "Stream is used for internal purposes, e.g., robotic vacuum using camera for navigation. While the " +
                "primary use-case for a stream of this usage-type is for an internal purpose, it may be re-used for " +
                "other camera functions, e.g., LiveView. However, this stream shall not be modified."
        },

        {
            tag: "field", name: "Recording", description: "Stream for recording clips.",
            xref: "cluster§11.1.3.1.2",
            details: "Stream is used for clip upload and archival."
        },
        {
            tag: "field", name: "Analysis", description: "Stream for analysis and entity detection.",
            xref: "cluster§11.1.3.1.3",
            details: "Stream is used for automated audio/video analysis without archival."
        },
        {
            tag: "field", name: "LiveView", description: "Stream for liveview.", xref: "cluster§11.1.3.1.4",
            details: "Stream is used for live watching through client devices."
        }
    ]
});
