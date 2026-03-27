/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Network } from "@matter/general";

export * from "./NetworkReactNative.js";
export * from "./TcpServerReactNative.js";
export * from "./TcpSocketReactNative.js";

export async function closeNetwork() {
    if (Environment.default.has(Network)) {
        return Environment.default.get(Network).close();
    }
}
