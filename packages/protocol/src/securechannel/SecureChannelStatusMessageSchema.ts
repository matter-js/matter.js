/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProtocolStatusMessage, ProtocolStatusMessageSchema } from "#protocol/ProtocolStatusMessage.js";
import { SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";

export type SecureChannelStatus = ProtocolStatusMessage<SecureChannelStatusCode>;

export class SecureChannelStatusMessageSchema extends ProtocolStatusMessageSchema<SecureChannelStatus> {}

export const SecureChannelStatusMessage = new SecureChannelStatusMessageSchema(SECURE_CHANNEL_PROTOCOL_ID);
