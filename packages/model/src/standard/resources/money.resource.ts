/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "money", description: "Money", xref: "core§7.19.2.18",

    details: "This type represents an amount of money." +
        "\n" +
        "The money type shall be used in concert with a CurrencyStruct to indicate the currency in use, as " +
        "well as the number of digits after the decimal point in the amount of that currency." +
        "\n" +
        "For example, if a given money value is 1015, the value of the associated Currency field is 840 " +
        "(USD), and the value of the associated DecimalPoints field is 4, then the represented amount would " +
        "be 0.1015 dollars, or 10.15 cents." +
        "\n" +
        "Similarly, if a given money value is 1015, the value of the associated Currency field is 978 (EUR), " +
        "and the value of the associated DecimalPoints field is 2, then the represented amount would be 10.15 " +
        "euros." +
        "\n" +
        "Similarly, if a given money value is 1015, the value of the associated Currency field is 392 (JPY), " +
        "and the value of the associated DecimalPoints field is 0, then the represented amount would be 1015 " +
        "yen." +
        "\n" +
        "Operations involving money types shall be done using fixed point arithmetic. The results of " +
        "arithmetic operations involving money shall be rescaled in accordance with the associated Currency " +
        "structure rather than result in altering the DecimalPoints."
});
