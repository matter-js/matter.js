/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

// WebRTCSessionStruct and ICEServerStruct are defined globally at §11.4 but reference cross-cluster types.
// patchIllegalCrossClusterReferences only handles cluster-internal references, so we override the affected fields here.
LocalMatter.children.push({
    tag: "cluster",
    name: "WebRtcTransportProvider",
    asOf: "1.5",

    children: [
        {
            tag: "datatype",
            name: "WebRTCSessionStruct",
            type: "struct",
            children: [
                { tag: "field", id: 0x4, name: "VideoStreamId", type: "CameraAvStreamManagement.VideoStreamID" },
                { tag: "field", id: 0x5, name: "AudioStreamId", type: "CameraAvStreamManagement.AudioStreamID" },
            ],
        },
        {
            tag: "datatype",
            name: "ICEServerStruct",
            type: "struct",
            children: [{ tag: "field", id: 0x3, name: "Caid", type: "TlsCertificateManagement.TLSCAID" }],
        },
    ],
});
