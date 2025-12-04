/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visual demarcators for specific log elements.
 */
export namespace Mark {
    export const INBOUND = "«";
    export const OUTBOUND = "»";
    export const SESSION = "•"; // Makes more sense but renders poorly: "⚭" (marriage).  Infinity OK too: "∞"
    export const LOCAL_SESSION = "◦";
    export const EXCHANGE = "⇵";
    export const MESSAGE = "✉";
}
