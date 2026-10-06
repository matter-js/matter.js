/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test harness for node tests, published as `@matter/node/testing`.
 *
 * It only works under the `@matter/testing` mocha runner. Importing it registers `beforeEach`, `afterEach` and `after`
 * hooks (see {@link MockServerNode}), and the helpers use the global `expect` and `MockTime`.
 */
export * from "./mock-exchange.js";
export * from "./mock-server-node.js";
export * from "./mock-site.js";
export * from "./node-helpers.js";
