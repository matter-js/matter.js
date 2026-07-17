/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, MatterError } from "@matter/general";
import { BasicTlv, MeshCopTlvType } from "@matter/protocol";

/** Thrown when a commissioner BR response (LeadKa/LeadPet) cannot be parsed. */
export class CommissionerProtocolError extends MatterError {}

export interface LeadKaResponse {
    state: "accept" | "reject" | "pending";
}

/** MeshCoP State TLV values (Thread spec Table 8-11). */
const STATE_ACCEPT = 0x01;
const STATE_REJECT = 0xff;

export namespace LeadKa {
    /**
     * Build a MGMT_COMMISSIONER_KA.req payload.
     *
     * @param sessionId - Commissioner session ID assigned by the Border Router.
     * @param state - `"accept"` to keep the session alive; `"reject"` to resign it.
     */
    export function buildRequest(sessionId: number, state: "accept" | "reject" = "accept"): Bytes {
        const sessionBytes = new Uint8Array(2);
        sessionBytes[0] = (sessionId >> 8) & 0xff;
        sessionBytes[1] = sessionId & 0xff;
        // MGMT_COMMISSIONER_KA.req carries a State TLV ahead of the session id;
        // without it the Border Agent treats the keep-alive as malformed and lets
        // the commissioner session expire.
        return BasicTlv.encode([
            { type: MeshCopTlvType.STATE, value: new Uint8Array([state === "reject" ? STATE_REJECT : STATE_ACCEPT]) },
            { type: MeshCopTlvType.COMMISSIONER_SESSION_ID, value: sessionBytes },
        ]);
    }

    export function parseResponse(payload: Bytes): LeadKaResponse {
        const entries = BasicTlv.walk(payload);
        for (const entry of entries) {
            if (entry.type === MeshCopTlvType.STATE) {
                const byte = Bytes.of(entry.value)[0];
                if (byte === 0x01) return { state: "accept" };
                if (byte === 0xff) return { state: "reject" };
                if (byte === 0x00) return { state: "pending" };
                throw new CommissionerProtocolError(`LeadKa: unknown state byte ${byte}`);
            }
        }
        throw new CommissionerProtocolError("LeadKa: response missing STATE TLV");
    }
}
