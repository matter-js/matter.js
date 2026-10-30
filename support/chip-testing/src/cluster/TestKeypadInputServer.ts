/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeypadInputServer } from "@matter/main/behaviors/keypad-input";
import { KeypadInput } from "@matter/main/clusters/keypad-input";

/**
 * A video player's keypad with every feature chip's tv-app declares on its video player endpoint (FeatureMap 7).
 *
 * Accepts every key code. The TH stands in for a video player in the client cases, which check what the DUT sent and
 * that the TH answered it with success.
 */
export class TestKeypadInputServer extends KeypadInputServer.with("NavigationKeyCodes", "LocationKeys", "NumberKeys") {
    override sendKey(_request: KeypadInput.SendKeyRequest): KeypadInput.SendKeyResponse {
        return { status: KeypadInput.Status.Success };
    }
}
