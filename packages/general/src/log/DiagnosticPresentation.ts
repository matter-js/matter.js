/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DiagnosticPresentation {
    /**
     * Render an object as a log message.
     */
    Message = "message",

    /**
     * By default iterables render as a single line with spaces separating.  The "list" presentation treats elements
     * instead as separate entities which typically means presentation on different lines.
     *
     * Within an iterable, a list also serves to present contained items as subordinate to the previous item.
     */
    List = "list",

    /**
     * Render iterables without intervening spaces.
     */
    Squash = "squash",

    /**
     * An emphasized diagnostic.  Rendered to draw attention.
     */
    Strong = "strong",

    /**
     * A deemphasized diagnostic.  Rendered to draw less attention than default rendering.
     */
    Weak = "weak",

    /**
     * A keylike diagnostic to list flags.  The key gets suppressed and the value is rendered as a key.
     */
    Flag = "flag",

    /**
     * An error message diagnostic.
     */
    Error = "error",

    /**
     * A key/value diagnostic.  Rendered as a group of key/value pairs.
     */
    Dictionary = "dictionary",

    /**
     * Path, resource or session identifier.
     */
    Via = "via",

    /**
     * Resource that was added.
     */
    Added = "added",

    /**
     * Resource that was removed.
     */
    Deleted = "deleted",
}

export namespace DiagnosticPresentation {
    /**
     * Property name allowing objects to indicate their preferred presentation.
     */
    export const presentation: unique symbol = Symbol.for("matter.diagnostic.presentation");

    /**
     * Property name that redirects diagnostic presentation.
     */
    export const value: unique symbol = Symbol.for("matter.diagnostic.value");

    /**
     * Property name that assigns a diagnostic segment as the name of an object.
     */
    export const name: unique symbol = Symbol.for("matter.diagnostic.name");
}
