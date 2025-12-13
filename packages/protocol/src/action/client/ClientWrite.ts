/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Write } from "#action/request/Write.js";

export interface ClientWrite extends Write {
    /**
     * If true, the request will be queued over all peers of the node
     */
    queued?: boolean;
}
