/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshCopTlvType } from "../dataset/meshcopTlvTypes.js";
import { BasicTlv } from "../tlv/BasicTlvCodec.js";

export interface LeadKaResponse {
    state: "accept" | "reject" | "pending";
}

/** MeshCoP State TLV value for an "alive" keep-alive (Thread spec Table 8-11). */
const STATE_ACCEPT = 0x01;

export namespace LeadKa {
    export function buildRequest(sessionId: number): Uint8Array {
        const sessionBytes = new Uint8Array(2);
        sessionBytes[0] = (sessionId >> 8) & 0xff;
        sessionBytes[1] = sessionId & 0xff;
        // MGMT_COMMISSIONER_KA.req carries a State TLV (accept) ahead of the
        // session id; without it the Border Agent treats the keep-alive as
        // malformed and lets the commissioner session expire.
        return BasicTlv.encode([
            { type: MeshCopTlvType.STATE, value: new Uint8Array([STATE_ACCEPT]) },
            { type: MeshCopTlvType.COMMISSIONER_SESSION_ID, value: sessionBytes },
        ]);
    }

    export function parseResponse(payload: Uint8Array): LeadKaResponse {
        const entries = BasicTlv.walk(payload);
        for (const entry of entries) {
            if (entry.type === MeshCopTlvType.STATE) {
                const byte = entry.value[0];
                if (byte === 0x01) return { state: "accept" };
                if (byte === 0xff) return { state: "reject" };
                if (byte === 0x00) return { state: "pending" };
                throw new Error(`LeadKa: unknown state byte ${byte}`);
            }
        }
        throw new Error("LeadKa: response missing STATE TLV");
    }
}
