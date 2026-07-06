/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadDiagError } from "../../diagnostic/errors.js";

/**
 * Decoded Leader Data TLV (Network Diagnostic TLV type 6).
 *
 * Layout per OpenThread `mle_tlvs.hpp` `LeaderDataTlvValue`:
 *
 *   [0..3]  uint32 BE  partition ID
 *   [4]     uint8      weighting
 *   [5]     uint8      data version
 *   [6]     uint8      stable data version
 *   [7]     uint8      leader router ID
 */
export interface LeaderData {
    partitionId: number;
    weighting: number;
    dataVersion: number;
    stableDataVersion: number;
    leaderRouterId: number;
}

export namespace LeaderData {
    export function decode(value: Bytes): LeaderData {
        const buf = Bytes.of(value);
        if (buf.length !== 8) {
            throw new ThreadDiagError(`LeaderData TLV must be 8 bytes, got ${buf.length}`);
        }
        const partitionId = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
        return {
            partitionId,
            weighting: buf[4],
            dataVersion: buf[5],
            stableDataVersion: buf[6],
            leaderRouterId: buf[7],
        };
    }

    export function encode(data: LeaderData): Bytes {
        if (data.partitionId < 0 || data.partitionId > 0xffffffff) {
            throw new InternalError(`LeaderData partitionId out of range: ${data.partitionId}`);
        }
        const out = new Uint8Array(8);
        out[0] = (data.partitionId >>> 24) & 0xff;
        out[1] = (data.partitionId >>> 16) & 0xff;
        out[2] = (data.partitionId >>> 8) & 0xff;
        out[3] = data.partitionId & 0xff;
        out[4] = data.weighting & 0xff;
        out[5] = data.dataVersion & 0xff;
        out[6] = data.stableDataVersion & 0xff;
        out[7] = data.leaderRouterId & 0xff;
        return out;
    }
}
