/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountLoginServer } from "@matter/main/behaviors/account-login";
import { AccountLogin } from "@matter/main/clusters/account-login";
import { StatusResponse } from "@matter/main/types";

/** The Setup PIN chip's tv-app returns and accepts for every account (`AccountLoginManager`'s default constructor). */
export const CHIP_TV_SETUP_PIN = "tempPin123";

/**
 * A content app's account login with one Setup PIN for every account, as chip's tv-app has on its content app endpoint.
 *
 * | Command     | Answer                                                                           |
 * | ----------- | -------------------------------------------------------------------------------- |
 * | GetSetupPIN | {@link CHIP_TV_SETUP_PIN}, for every TempAccountIdentifier                       |
 * | Login       | Success for {@link CHIP_TV_SETUP_PIN}, otherwise UNSUPPORTED_ACCESS              |
 * | Logout      | Success                                                                          |
 *
 * chip answers a wrong PIN of 8 or more characters with UNSUPPORTED_ACCESS too. The server keeps no logged-in account
 * and does not limit the request rate that § 6.2.4.1 and § 6.2.4.3 require.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.2.4
 */
export class TestAccountLoginServer extends AccountLoginServer {
    override getSetupPin(): AccountLogin.GetSetupPinResponse {
        return { setupPin: CHIP_TV_SETUP_PIN };
    }

    override login({ setupPin }: AccountLogin.LoginRequest) {
        if (setupPin !== CHIP_TV_SETUP_PIN) {
            throw new StatusResponse.UnsupportedAccessError(`Setup PIN "${setupPin}" does not match`);
        }
    }

    override logout() {}
}
