/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/main";
import type { QrCodeData } from "@matter/main/types";
import { QrPairingCodeCodec } from "@matter/main/types";

/**
 * The one onboarding payload `code` carries.
 *
 * A concatenated code (Matter Core § 5.1.3.2) names several commissionees. `ControllerAdapter.commission()`
 * pairs one, and neither controller can be told which, so such a code is refused rather than paired with
 * whichever device answers first.
 */
export function singleQrPayload(code: string): QrCodeData {
    const payloads = QrPairingCodeCodec.decode(code);
    if (payloads.length !== 1) {
        throw new ImplementationError(
            `QR pairing code carries ${payloads.length} payloads; commission() pairs one device, so a ` +
                "concatenated code must be split by the caller",
        );
    }
    return payloads[0];
}
