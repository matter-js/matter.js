/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "struct", description: "Struct", xref: "core§7.19.1.9",

    details: "A struct is a sequence of fields of any data type. Individual fields are identified by a field ID of " +
        "unsigned integer, starting at 0 (zero), for the first field." +
        "\n" +
        "  - A struct itself shall have no constraint qualities." +
        "\n" +
        "  - Each struct field shall have its own qualities." +
        "\n" +
        "  - Access, conformance and persistence qualities, when not explicitly defined, shall be inherited " +
        "from the instance of the struct itself." +
        "\n" +
        "  - Struct fields may have optional conformance." +
        "\n" +
        "  - A struct shall support reading and reporting of all fields." +
        "\n" +
        "  - A struct shall support reporting changes to one or more fields." +
        "\n" +
        "  - If the struct is writable, it shall support writing the entire struct." +
        "\n" +
        "  - If a field of the struct is writable, the struct shall support updating the field." +
        "\n" +
        "  - Because of optional struct field conformance, instances of the same struct may support multiple " +
        "'flavors' of the same struct data type, but with a different set of optional fields."
});
