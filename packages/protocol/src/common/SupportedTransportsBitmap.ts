/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BitFlag, BitmapSchema, TypeFromBitSchema } from "@matter/types";

export const SupportedTransportsBitmap = {
    // Bit 0 is reserved
    /**
     * TCP Client
     * The advertising Node implements the TCP Client mode and MAY connect to a peer Node that is a TCP Server.
     */
    tcpClient: BitFlag(1),

    /**
     * TCP Server
     * The advertising Node implements the TCP Server mode and SHALL listen for incoming TCP connections.
     */
    tcpServer: BitFlag(2),
};
export const SupportedTransportsSchema = BitmapSchema(SupportedTransportsBitmap);

export interface SupportedTransportsBitmap extends TypeFromBitSchema<typeof SupportedTransportsBitmap> {}
