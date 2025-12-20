/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import { ClientRequest } from "./ClientRequest.js";

export interface ClientRead extends Read, ClientRequest {}
