/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Write } from "#action/request/Write.js";
import { ClientRequest } from "./ClientRequest.js";
import { RequestFlagsOptions } from "./RequestFlagsOptions.js";

export interface ClientWrite extends Write, ClientRequest, RequestFlagsOptions {}
