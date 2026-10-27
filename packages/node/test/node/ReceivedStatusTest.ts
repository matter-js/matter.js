/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdentifyClient, IdentifyServer } from "#behaviors/identify";
import { OnOffClient } from "#behaviors/on-off";
import { OperationalCredentialsClient, OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { VendorIdVerification } from "#behaviors/operational-credentials";
import { OnOffLightDevice } from "#devices/on-off-light";
import { EndpointReadFailedError } from "#endpoint/errors.js";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, Environment, Seconds } from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { CommissioningError } from "@matter/protocol";
import {
    FabricIndex,
    ReceivedStatusResponse,
    ReceivedStatusResponseError,
    Status,
    StatusResponse,
    StatusResponseError,
} from "@matter/types";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

let rejectIdentify: StatusResponseError | undefined;

class RejectingIdentifyServer extends IdentifyServer {
    override identify(request: Parameters<IdentifyServer["identify"]>[0]) {
        if (rejectIdentify) {
            throw rejectIdentify;
        }
        return super.identify(request);
    }
}

let signVidVerification:
    | ((
          response: OperationalCredentials.SignVidVerificationResponse,
      ) => OperationalCredentials.SignVidVerificationResponse)
    | undefined;

let rejectCertificateChainRequest: StatusResponseError | undefined;

class ScriptedOperationalCredentialsServer extends OperationalCredentialsServer {
    override async signVidVerificationRequest(request: OperationalCredentials.SignVidVerificationRequest) {
        const response = await super.signVidVerificationRequest(request);
        return signVidVerification ? signVidVerification(response) : response;
    }

    override async certificateChainRequest(request: OperationalCredentials.CertificateChainRequest) {
        if (rejectCertificateChainRequest) {
            throw rejectCertificateChainRequest;
        }
        return super.certificateChainRequest(request);
    }
}

const ScriptedRoot = MockServerNode.RootEndpoint.with(ScriptedOperationalCredentialsServer);

function makeEntropic(...nodes: { env: Environment }[]) {
    for (const { env } of nodes) {
        const crypto = env.get(Crypto);
        if ("entropic" in crypto) {
            crypto.entropic = true;
        }
    }
}

async function capture(operation: () => Promise<unknown>) {
    try {
        await MockTime.resolve(operation(), { macrotasks: true });
    } catch (error) {
        return error;
    }
    expect.fail("operation did not fail");
}

describe("ReceivedStatus", () => {
    before(() => {
        MockTime.init();
    });

    afterEach(() => {
        rejectIdentify = undefined;
        signVidVerification = undefined;
        rejectCertificateChainRequest = undefined;
    });

    describe("invoke", () => {
        async function setup() {
            const site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    device: OnOffLightDevice.with(RejectingIdentifyServer),
                },
            });
            const identify = controller.peers.get("peer1")!.endpoints.for(1).commandsOf(IdentifyClient);
            return { site, identify };
        }

        it("throws a received specialization for a status the device sent", async () => {
            const { site, identify } = await setup();
            await using _site = site;

            rejectIdentify = new StatusResponse.FailureError(undefined, 7);
            const error = await capture(() => identify.identify({ identifyTime: 1 }));

            expect(error).instanceOf(ReceivedStatusResponse.FailureError);
            expect(error).instanceOf(ReceivedStatusResponseError);
            expect(error).instanceOf(StatusResponseError);
            const { code, clusterCode } = StatusResponseError.of(error)!;
            expect(code).equal(Status.Failure);
            expect(clusterCode).equal(7);
        });

        it("throws a local error when validation rejects the request before sending", async () => {
            const { site, identify } = await setup();
            await using _site = site;

            const error = await capture(() => identify.identify({ identifyTime: -1 }));

            expect(error).instanceOf(StatusResponseError);
            expect(error).not.instanceOf(ReceivedStatusResponseError);
        });
    });

    describe("VendorIdVerification.verify", () => {
        async function setup() {
            const site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: ScriptedRoot } });
            const peer = controller.peers.get("peer1")!;
            const { fabrics, nocs, trustedRootCertificates } = peer.stateOf(OperationalCredentialsClient);
            const options = { fabric: fabrics[0], noc: nocs[0], rcac: trustedRootCertificates[0] };
            return { site, peer, options };
        }

        it("returns undefined when the device rejects the signing request", async () => {
            const { site, peer, options } = await setup();
            await using _site = site;

            signVidVerification = () => {
                throw new StatusResponse.InvalidCommandError();
            };

            const result = await MockTime.resolve(VendorIdVerification.verify(peer, options), { macrotasks: true });

            expect(result).undefined;
        });

        it("rethrows the local error for a response with a foreign fabric index", async () => {
            const { site, peer, options } = await setup();
            await using _site = site;

            signVidVerification = response => ({ ...response, fabricIndex: FabricIndex(response.fabricIndex + 1) });

            const error = await capture(() => VendorIdVerification.verify(peer, options));

            expect(error).instanceOf(StatusResponse.InvalidCommandError);
        });
    });

    describe("commissioning", () => {
        it("keeps the device's status in the cause of the CommissioningError", async () => {
            await using site = new MockSite();
            const controller = await site.addController();
            const device = await site.addNode(ScriptedRoot, { device: OnOffLightDevice });
            makeEntropic(controller, device);
            await controller.start();

            rejectCertificateChainRequest = new StatusResponse.FailureError();
            const { passcode, discriminator } = device.state.commissioning;
            const error = await capture(() =>
                controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }),
            );

            expect(error).instanceOf(CommissioningError);
            expect(ReceivedStatusResponseError.of(error)?.code).equal(Status.Failure);
        });
    });

    describe("endpoint read", () => {
        it("keeps the origin of a device status in EndpointReadFailedError", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            makeEntropic(controller, device);
            await controller.start();
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({ passcode, discriminator, timeout: Seconds(90), autoSubscribe: false }),
                { macrotasks: true },
            );

            // Without a subscription the controller keeps endpoint 1, so the read reaches the device
            await MockTime.resolve(device.parts.get(1)!.delete(), { macrotasks: true });

            const error = await capture(() =>
                controller.peers.get("peer1")!.endpoints.for(1).getStateOf(OnOffClient, ["onOff"]),
            );

            if (!(error instanceof EndpointReadFailedError)) {
                expect.fail(`expected EndpointReadFailedError, got ${error}`);
            }
            expect(error.failed.length).greaterThan(0);
            for (const failure of error.failed) {
                expect(failure.status).equal(Status.UnsupportedEndpoint);
                expect(failure.received).equal(true);
                expect(failure).not.have.property("kind");
            }
        });
    });
});
