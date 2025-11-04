/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a position
 * relative to the device (e.g. the temperature sensor in the top drawer of a refrigerator, or location of the buttons
 * on a multi-button switch device). Note the difference with Chapter 5, Common Direction Semantic Tag Namespace.
 *
 * When multiple endpoints are used for device types, and the associated consumer-facing locations of those endpoints
 * are organized in a straight line, grid or matrix, these endpoints SHOULD be allocated in top-to-bottom, left-to-right
 * order.
 *
 * For grids or arrays larger than 3 elements in any direction, the Row and Column tags SHOULD be used.
 *
 * If the Row or Column tags are used, the Label field in the same Semantic Tag structure shall be filled with a number
 * comprised of Arabic numerals encoded as a string to indicate the row/column of the item. Number words (e.g. "one",
 * "two", etc.) shall NOT be used to describe the position of the item. The first row/column shall use Label "1".
 *
 * The following example illustrates a compound device comprised of 9 endpoints arranged in a 3x3 grid. This example
 * uses position tags to indicate position.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 9
 */
export const PositionTag = SemanticNamespace({
    id: 0x8,

    tags: {
        Left: { id: 0x0, label: "Left" },
        Right: { id: 0x1, label: "Right" },
        Top: { id: 0x2, label: "Top" },
        Bottom: { id: 0x3, label: "Bottom" },
        Middle: { id: 0x4, label: "Middle" },

        /**
         * Numeric value provided in Label field
         */
        Row: { id: 0x5, label: "Row" },

        /**
         * Numeric value provided in Label field
         */
        Column: { id: 0x6, label: "Column" }
    }
});
