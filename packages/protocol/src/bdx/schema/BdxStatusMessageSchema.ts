/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProtocolStatusMessage, ProtocolStatusMessageSchema } from "#protocol/ProtocolStatusMessage.js";
import { BDX_PROTOCOL_ID, BdxStatusCode } from "#types";

export type BdxStatus = Omit<ProtocolStatusMessage<BdxStatusCode>, "protocolData">;

export class BdxStatusMessageSchema extends ProtocolStatusMessageSchema<BdxStatus> {}

export const BdxStatusMessage = new BdxStatusMessageSchema(BDX_PROTOCOL_ID, false);
