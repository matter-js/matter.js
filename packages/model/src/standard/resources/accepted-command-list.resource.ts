/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "attribute", name: "AcceptedCommandList", xref: "core§7.13.4",

    details: "This attribute is a list of client generated commands which are supported by this cluster server " +
        "instance." +
        "\n" +
        "Each instance of a cluster shall support this attribute." +
        "\n" +
        "This attribute shall be a list of the command IDs for client generated commands that are supported " +
        "and processed by the server." +
        "\n" +
        "For each client request command in this list that mandates a response from the server, the response " +
        "command shall be indicated in the GeneratedCommandList attribute." +
        "\n" +
        "If any attribute on a server supports atomic writes, this attribute shall contain the command ID for " +
        "AtomicRequest."
});
