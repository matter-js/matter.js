/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "list", description: "List", xref: "core§7.19.1.8",

    details: "A list is defined as a collection of entries of the same data type, with a finite count from 0 to " +
        "65534. A cluster specification may define further constraints on the maximum possible count. The " +
        "list entry data type shall be any defined data type, except a list data type, or any data type " +
        "derived from a list." +
        "\n" +
        "The quality columns for a list definition are for the list." +
        "\n" +
        "The list entries are indicated with an index that is an unsigned integer starting at 0 (zero). The " +
        "maintained order of entries, by index, is defined in the cluster specification, or undefined. Data " +
        "that is defined as a list is indicated with \"list[X]\" where X is the entry type. The data type of " +
        "the list entry has its own qualities, constraints, and conformance." +
        "\n" +
        "### To define qualities for the list entry data type, make the list entry data type a defined local " +
        "derived data type, with a table including the columns required to define and constrain the data " +
        "type." +
        "\n" +
        "There is an inline shortcut to define the list entry data type constraints. See List Constraints." +
        "\n" +
        "It is recommended to put a maximum constraint on the list and list entry data types." +
        "\n" +
        "It is recommended that a list entry data type be a struct, to enable the addition of new fields to " +
        "the list’s entries in the future." +
        "\n" +
        "  • The cluster data version shall be incremented when the list order or entries change." +
        "\n" +
        "  • An entry shall NOT be NULL." +
        "\n" +
        "  • The list shall support reading and reporting all entries." +
        "\n" +
        "  • The list shall support reporting, updates, and/or deletion of one or more entries." +
        "\n" +
        "  • If the list is writable, it shall support writing or deleting the entire list." +
        "\n" +
        "  • If the list is writable, it shall support updating one or more individual entries by indicating " +
        "    an index per updated entry." +
        "\n" +
        "  • If the list is writable, it shall support deleting one or more individual entries by indicating " +
        "    an index per deleted entry." +
        "\n" +
        "  • If the list is writable, it shall support adding one or more individual entries." +
        "\n" +
        "  • A list may define an entry that is a struct that is fabric-scoped (see Section 7.6.4, " +
        "    “Fabric-Scoped Access”)." +
        "\n" +
        "### Fabric-Scoped List" +
        "\n" +
        "  • A fabric-scoped list shall define an entry data type that is a struct, which shall also be " +
        "    fabric-scoped (see Fabric-Scoped Struct)." +
        "\n" +
        "Each entry in a fabric-scoped list shall be fabric-scoped to a particular fabric or no fabric." +
        "\n" +
        "### Fabric-Filtered List" +
        "\n" +
        "A fabric-scoped list supports a fabric-filter that filters the view of the list for read and write " +
        "interactions. This filter simplifies client side logic that does not want to read or write fabric " +
        "data that is not associated with the accessing fabric." +
        "\n" +
        "  • An interaction upon a list with fabric-filtering shall only indicate and access entries where " +
        "    the associated fabric matches the accessing fabric, and all other entries shall be ignored." +
        "\n" +
        "  • Fabric-filtered list entries shall be in the same order as the full list." +
        "\n" +
        "  • Fabric-filtered list entries shall be indexed from 0 with no gaps, as if the other entries did " +
        "    not exist." +
        "\n" +
        "  • For a write interaction, fabric-filtering shall be enabled." +
        "\n" +
        "  • When writing to a fabric-scoped list, the write interaction shall be on an accessing fabric, " +
        "    otherwise, the write interaction shall fail (see Interaction Model Specification)." +
        "\n" +
        "  • For a read interaction on a list, fabric-filtering may be enabled." +
        "\n" +
        "  • For a read interaction on a list, with fabric-filtering disabled, the list shall be reported as " +
        "    a full list with all entries."
});
