/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global datatypes the specification names by their struct name, keyed by that name, with the name we give them.
 *
 * The specification uses the struct name both for the section that defines the datatype and for references to it.
 * Mode Select defines its own, different datatype named `SemanticTagStruct`, so a reference resolves to the global only
 * where no datatype of that name is in scope.
 */
export const GlobalDatatypeAliases = new Map([
    ["SemanticTagStruct", "semtag"],
    ["LocationDescriptorStruct", "locationdesc"],
    ["CurrencyStruct", "currency"],
]);
