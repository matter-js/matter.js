/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import { ClientRequest } from "./ClientRequest.js";

export interface ClientRead extends Read, ClientRequest {
    /** Set to true to skip the automatic data version injection to also include known data versions in the results */
    includeKnownVersions?: boolean;
}
