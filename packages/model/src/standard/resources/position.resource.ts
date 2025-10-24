/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "Position", xref: "namespace§9",

    details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
        "association with a position relative to the device (e.g. the temperature sensor in the top drawer of " +
        "a refrigerator, or location of the buttons on a multi-button switch device). Note the difference " +
        "with Chapter 5, Common Direction Semantic Tag Namespace." +
        "\n" +
        "When multiple endpoints are used for device types, and the associated consumer-facing locations of " +
        "those endpoints are organized in a straight line, grid or matrix, these endpoints SHOULD be " +
        "allocated in top-to-bottom, left-to-right order." +
        "\n" +
        "For grids or arrays larger than 3 elements in any direction, the Row and Column tags SHOULD be used." +
        "\n" +
        "If the Row or Column tags are used, the Label field in the same Semantic Tag structure shall be " +
        "filled with a number comprised of Arabic numerals encoded as a string to indicate the row/column of " +
        "the item. Number words (e.g. \"one\", \"two\", etc.) shall NOT be used to describe the position of the " +
        "item. The first row/column shall use Label \"1\"." +
        "\n" +
        "The following example illustrates a compound device comprised of 9 endpoints arranged in a 3x3 grid. " +
        "This example uses position tags to indicate position.",

    children: [
        { tag: "semanticTag", name: "Row", description: "Numeric value provided in Label field" },
        { tag: "semanticTag", name: "Column", description: "Numeric value provided in Label field" }
    ]
});
