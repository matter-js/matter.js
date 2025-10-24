/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "struct", description: "Struct", xref: "core§7.19.1.9",

    details: "A struct is a sequence of fields of any data type. Individual fields are identified by a field ID of " +
        "unsigned integer, starting at 0 (zero), for the first field." +
        "\n" +
        "  • A struct itself shall have no constraint qualities." +
        "\n" +
        "  • Each struct field shall have its own qualities." +
        "\n" +
        "  • Access, conformance and persistence qualities, when not explicitly defined, shall be inherited " +
        "    from the instance of the struct itself." +
        "\n" +
        "  • Struct fields may have optional conformance." +
        "\n" +
        "  • A struct shall support reading and reporting of all fields." +
        "\n" +
        "  • A struct shall support reporting changes to one or more fields." +
        "\n" +
        "  • If the struct is writable, it shall support writing the entire struct." +
        "\n" +
        "  • If a field of the struct is writable, the struct shall support updating the field." +
        "\n" +
        "  • Because of optional struct field conformance, instances of the same struct may support multiple " +
        "    'flavors' of the same struct data type, but with a different set of optional fields." +
        "\n" +
        "### Fabric-Scoped Struct" +
        "\n" +
        "  • A fabric-scoped struct shall only be defined and occur as an entry in a fabric-scoped list." +
        "\n" +
        "  • A fabric-scoped struct shall support the global FabricIndex field of type fabric-index, which " +
        "    indicates the associated fabric of the struct, or indicates that there is no associated fabric." +
        "\n" +
        "  • The table that defines fields of a fabric-scoped struct shall NOT list the global FabricIndex " +
        "    field, which is a global field and defined implicitly." +
        "\n" +
        "  • The global FabricIndex field of a fabric-scoped struct SHOULD NOT be indicated in a write " +
        "    interaction." +
        "\n" +
        "  • The global FabricIndex field of a fabric-scoped struct shall be ignored in a write interaction." +
        "\n" +
        "  • The global FabricIndex field SHOULD NOT be indicated on a fabric-scoped struct contained in the " +
        "    payload of a request command." +
        "\n" +
        "  • The global FabricIndex field shall be ignored on a fabric-scoped struct contained in the payload " +
        "    of a request command." +
        "\n" +
        "  • When a write interaction creates a fabric-scoped struct entry (in a fabric-scoped list), the " +
        "    server shall implicitly load the accessing fabric-index into the global FabricIndex field of the " +
        "    struct." +
        "\n" +
        "  • When the payload of a request command contains a fabric-scoped struct, the server shall " +
        "    implicitly load the accessing fabric-index into the global FabricIndex field of the struct." +
        "\n" +
        "### • A fabric-scoped struct may be defined with some fields that are fabric-sensitive." +
        "\n" +
        "  • For interactions on a fabric-scoped struct that report back data, fabric-sensitive struct fields " +
        "    shall be omitted when reporting data back to the client, when the struct has an associated " +
        "    fabric, and it is not the accessing fabric."
});
