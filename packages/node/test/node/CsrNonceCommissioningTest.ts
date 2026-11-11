/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Bytes, Crypto, Seconds } from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { NocsrCheck, NocsrError } from "@matter/protocol";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

/** Signs the NOCSR elements over a nonce that differs from the one the commissioner sent. */
class WrongCsrNonceServer extends OperationalCredentialsServer {
    override csrRequest(request: OperationalCredentials.CsrRequest) {
        const csrNonce = Bytes.of(request.csrNonce).map(byte => byte ^ 0xff);
        return super.csrRequest({ ...request, csrNonce });
    }
}

describe("CSR nonce check during commissioning", () => {
    before(() => {
        MockTime.init();
    });

    it("stops commissioning when the CSRResponse carries another nonce", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const device = await site.addNode(MockServerNode.RootEndpoint.with(WrongCsrNonceServer), {
            device: OnOffLightDevice,
        });
        for (const { env } of [controller, device]) {
            const crypto = env.get(Crypto);
            if ("entropic" in crypto) {
                crypto.entropic = true;
            }
        }

        const { passcode, discriminator } = device.state.commissioning;

        let caught: unknown;
        await MockTime.resolve(
            controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }).catch(error => {
                caught = error;
            }),
            { macrotasks: true },
        );

        expect(caught).instanceOf(NocsrError).with.property("failure", NocsrCheck.CsrNonceMismatch);
    });
});
