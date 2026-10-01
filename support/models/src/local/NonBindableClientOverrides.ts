/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push(
    // The requestor's DefaultOTAProviders list and AnnounceOTAProvider choose the provider its client talks to
    {
        tag: "cluster",
        name: "OtaSoftwareUpdateProvider",
        id: 0x29,
        bindable: false,
    },

    // A WebRTC transport client talks to the peer of the session its application establishes
    {
        tag: "cluster",
        name: "WebRtcTransportProvider",
        id: 0x553,
        bindable: false,
    },
    {
        tag: "cluster",
        name: "WebRtcTransportRequestor",
        id: 0x554,
        bindable: false,
    },
);
