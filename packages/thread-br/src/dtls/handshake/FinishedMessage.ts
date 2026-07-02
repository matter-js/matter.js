/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Finished message body codec (RFC 5246 §7.4.9). The body is exactly the
 * 12-byte `verify_data` from the TLS PRF; the wider machinery — choosing
 * the role label, snapshotting the transcript, computing the PRF — sits in
 * `TlsPrf.verifyData` and the state machine.
 */

import { InternalError } from "@matter/general";
import { DtlsError } from "../channel/DtlsChannel.js";

const VERIFY_DATA_LEN = 12;

export const FinishedMessage = {
    build(verifyData: Uint8Array): Uint8Array {
        if (verifyData.length !== VERIFY_DATA_LEN) {
            throw new InternalError(`Finished verify_data must be ${VERIFY_DATA_LEN} bytes, got ${verifyData.length}`);
        }
        // slice (copy) so callers can mutate the input afterwards without aliasing the wire bytes.
        return verifyData.slice();
    },

    parse(body: Uint8Array): { verifyData: Uint8Array } {
        if (body.length !== VERIFY_DATA_LEN) {
            throw new DtlsError(`Finished body must be ${VERIFY_DATA_LEN} bytes, got ${body.length}`);
        }
        return { verifyData: body.slice() };
    },
} as const;

export const FINISHED_VERIFY_DATA_LEN = VERIFY_DATA_LEN;
