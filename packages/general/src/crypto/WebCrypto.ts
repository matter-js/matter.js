/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Our "Crypto" interface masks the standard web crypto "Crypto" type provided by typescript.  Make an alias to work
 * around this.
 */
export interface WebCrypto extends Crypto {}
