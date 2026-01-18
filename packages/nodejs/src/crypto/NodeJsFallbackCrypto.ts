/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto, FallbackCrypto } from "@matter/general";
import { NodeJsCrypto } from "./NodeJsCrypto.js";

/**
 * Node.js-based crypto implementation
 * 
 * with `StandardCrypto` fallback if there's an error.
 */
export class NodeJsFallbackCrypto extends FallbackCrypto {
  constructor() {
    super(
      new NodeJsCrypto(),
      new StandardCrypto(crypto),
    )
  }
}
