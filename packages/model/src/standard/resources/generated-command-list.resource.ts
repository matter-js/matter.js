/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "attribute", name: "GeneratedCommandList", xref: "core§7.13.5",

    details: "This attribute is a list of server generated commands. A server generated command is a server to " +
        "client command." +
        "\n" +
        "Each instance of a cluster shall support this attribute." +
        "\n" +
        "This attribute shall be a list of the command IDs for server generated commands." +
        "\n" +
        "For each command in this list that is a response to a client request command, the request command " +
        "shall be indicated in the AcceptedCommandList attribute." +
        "\n" +
        "If any attribute on a server supports atomic writes, this attribute shall contain the command ID for " +
        "AtomicResponse."
});
