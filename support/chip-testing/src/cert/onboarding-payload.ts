/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, MatterError, UnexpectedDataError } from "@matter/main";
import type { QrCodeData } from "@matter/main/types";
import { QrPairingCodeCodec } from "@matter/main/types";

/**
 * A controller refused an onboarding payload itself, before it looked for any commissionee.
 *
 * A step asserting "the DUT terminates commissioning" needs this and nothing broader. Both
 * controllers report a later failure — discovery, PASE, attestation, an invalid CSR response, a
 * command timeout — through error types that a payload refusal would otherwise share, so a
 * commissioner that *accepted* a forbidden code and only then failed would be recorded as having
 * refused it.
 */
export class OnboardingPayloadRefusedError extends MatterError {}

/**
 * The one onboarding payload `code` carries.
 *
 * A concatenated code (Matter Core § 5.1.3.2) names several commissionees. `ControllerAdapter.commission()`
 * pairs one, and neither controller can be told which, so such a code is refused rather than paired with
 * whichever device answers first.
 */
export function singleQrPayload(code: string): QrCodeData {
    const payloads = refusalOf(() => QrPairingCodeCodec.decode(code), `onboarding payload ${code}`);
    if (payloads.length !== 1) {
        throw new ImplementationError(concatenationRefusal(payloads.length));
    }
    return payloads[0];
}

/**
 * Runs `decode`, reporting the codec's own rejection of `what` as an
 * {@link OnboardingPayloadRefusedError}. matter.js raises {@link UnexpectedDataError} from the
 * commissioning flow as well, so the refusal has to be marked where it happens rather than
 * recognised by type afterwards.
 */
export function refusalOf<T>(decode: () => T, what: string): T {
    try {
        return decode();
    } catch (e) {
        if (e instanceof UnexpectedDataError) {
            throw new OnboardingPayloadRefusedError(`Refused ${what}: ${e.message}`);
        }
        throw e;
    }
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
