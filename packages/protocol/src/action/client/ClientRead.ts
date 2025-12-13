/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";

export interface ClientRead extends Read {
    /**
     * If true, the request will be queued over all peers of the node
     */
    queued?: boolean;
}
