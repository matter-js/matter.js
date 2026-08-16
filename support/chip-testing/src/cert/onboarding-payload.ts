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
        throw new ImplementationError(concatenationRefusal(payloads.length));
    }
    return payloads[0];
}

const QR_PREFIX = "MT:";

/** The delimiter § 5.1.3.2 joins a concatenated code's payloads with. */
const PAYLOAD_SEPARATOR = "*";

/**
 * Refuses a concatenated code the way {@link singleQrPayload} does, and judges nothing else about
 * `code`.
 *
 * For a controller that parses onboarding payloads itself, that division matters: a step asserting
 * "the DUT refuses this payload" needs the controller's own verdict, and a code matter.js rejected
 * first would put matter.js's verdict in the evidence instead. Concatenation is the exception,
 * because a controller told to pair one device from such a code silently pairs whichever of them
 * answers first.
 */
export function assertSingleQrPayload(code: string): void {
    if (!code.startsWith(QR_PREFIX)) {
        return;
    }
    const count = code.slice(QR_PREFIX.length).split(PAYLOAD_SEPARATOR).length;
    if (count !== 1) {
        throw new ImplementationError(concatenationRefusal(count));
    }
}

function concatenationRefusal(count: number): string {
    return (
        `QR pairing code carries ${count} payloads; commission() pairs one device, so a concatenated code ` +
        "must be split by the caller"
    );
}
