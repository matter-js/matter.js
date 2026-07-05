/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { MeshCopTlvType } from "../dataset/meshcopTlvTypes.js";
import { BasicTlv } from "../tlv/BasicTlvCodec.js";
import { CommissionerProtocolError } from "./LeadKa.js";

export interface LeadPetResponse {
    state: "accept" | "reject" | "pending";
    sessionId?: number;
}

export namespace LeadPet {
    export function buildRequest(commissionerId: string): Bytes {
        return BasicTlv.encode([
            { type: MeshCopTlvType.COMMISSIONER_ID, value: new TextEncoder().encode(commissionerId) },
        ]);
    }

    export function parseResponse(payload: Bytes): LeadPetResponse {
        const entries = BasicTlv.walk(payload);
        let state: "accept" | "reject" | "pending" | undefined;
        let sessionId: number | undefined;

        for (const entry of entries) {
            if (entry.type === MeshCopTlvType.STATE) {
                const byte = Bytes.of(entry.value)[0];
                if (byte === 0x01) state = "accept";
                else if (byte === 0xff) state = "reject";
                else if (byte === 0x00) state = "pending";
                else throw new CommissionerProtocolError(`LeadPet: unknown state byte ${byte}`);
            } else if (entry.type === MeshCopTlvType.COMMISSIONER_SESSION_ID) {
                const sessionIdBytes = Bytes.of(entry.value);
                sessionId = (sessionIdBytes[0] << 8) | sessionIdBytes[1];
            }
        }

        if (state === undefined) {
            const tlvSummary =
                entries.length === 0
                    ? "none"
                    : entries.map(e => `t=0x${e.type.toString(16)}/${e.value.byteLength}b`).join(",");
            throw new CommissionerProtocolError(
                `LeadPet: response missing STATE TLV (payload=${Bytes.toHex(payload)}, tlvs=[${tlvSummary}])`,
            );
        }

        return state === "accept" ? { state, sessionId } : { state };
    }
}
