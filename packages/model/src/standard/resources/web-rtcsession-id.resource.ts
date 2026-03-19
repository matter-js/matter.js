/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "WebRTCSessionID", xref: "cluster§11.4.5.1",
    details: "It represents an active WebRTC session. This value starts at 0 and monotonically increases by 1 with " +
        "each new allocation provisioned by the Node. A value incremented past 65534 shall wrap to 0. The " +
        "Node shall verify that the incremented ID does not match any other active session ID. If such a " +
        "match is found, the ID shall be incremented until a unique ID is found."
});
