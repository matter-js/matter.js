/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { Crypto, CRYPTO_PBKDF_ITERATIONS_MAX, CRYPTO_PBKDF_ITERATIONS_MIN, Seconds } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import {
    Advertisement,
    Advertiser,
    CommandInvokeResponse,
    CommissioningMode,
    DeviceAdvertiser,
    DeviceCommissioner,
    Fabric,
    FabricManager,
    Invoke,
    InvokeResult,
    MessageExchange,
    PaseClient,
    ServiceDescription,
    SessionManager,
} from "@matter/protocol";
import { NodeId, Status } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";

const { WindowNotOpen, BasicWindowOpen, EnhancedWindowOpen } = AdministratorCommissioning.CommissioningWindowStatus;
const { Busy, PakeParameterError, WindowNotOpen: WindowNotOpenCode } = AdministratorCommissioning.StatusCode;

const BasicCapableRootEndpoint = MockServerNode.RootEndpoint.with(AdministratorCommissioningServer.with("Basic"));

const PASSCODE = 20202021;
const DISCRIMINATOR = 1234;
const ADMINISTRATOR = NodeId(1);

const success = { status: Status.Success, clusterStatus: undefined };

function failure(clusterStatus: AdministratorCommissioning.StatusCode) {
    return { status: Status.Failure, clusterStatus };
}

function statusOf(status: Status) {
    return { status, clusterStatus: undefined };
}

const closedAttributes = { windowStatus: WindowNotOpen, adminFabricIndex: null, adminVendorId: null };

interface WindowRequestOptions {
    commissioningTimeout?: number;
    discriminator?: number;
    iterations?: number;
    saltLength?: number;
    verifierLength?: number;
}

/**
 * A commissioned device whose own commissioning window is closed, and the fabric of the administrator that talks to it.
 */
class Device {
    private constructor(
        readonly node: MockServerNode,
        readonly fabric: Fabric,
    ) {}

    static async create(type = MockServerNode.RootEndpoint) {
        const node = await MockServerNode.createOnline(type);
        const fabric = await node.addFabric();
        await node.set({
            accessControl: {
                acl: [
                    {
                        privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: [ADMINISTRATOR],
                        targets: null,
                        fabricIndex: fabric.fabricIndex,
                    },
                ],
            },
        });
        await MockTime.resolve(node.env.get(DeviceCommissioner).endCommissioning());
        return new Device(node, fabric);
    }

    async [Symbol.asyncDispose]() {
        await this.node.close();
    }

    get commissioner() {
        return this.node.env.get(DeviceCommissioner);
    }

    get attributes() {
        const { windowStatus, adminFabricIndex, adminVendorId } = this.node.stateOf(AdministratorCommissioningServer);
        return { windowStatus, adminFabricIndex, adminVendorId };
    }

    /**
     * The attribute values that name the administrator of {@link fabric} as opener, taken from its Fabrics entry.
     */
    get opener() {
        const entry = this.node
            .stateOf(OperationalCredentialsServer)
            .fabrics.find(({ fabricIndex }) => fabricIndex === this.fabric.fabricIndex);
        expect(entry).not.undefined;
        return { adminFabricIndex: entry?.fabricIndex, adminVendorId: entry?.vendorId };
    }

    async caseExchange() {
        return await this.node.createExchange({ fabric: this.fabric, peerNodeId: ADMINISTRATOR });
    }

    /**
     * An exchange on a PASE session, which has no fabric before AddNOC.
     */
    async paseExchange() {
        return await this.node.createExchange();
    }

    /**
     * An OpenCommissioningWindow request with a valid verifier, optionally with one field replaced.  The device does
     * not check that the verifier matches iterations and salt, so those can change without recomputing it.
     */
    async windowRequest({
        commissioningTimeout = 180,
        discriminator = DISCRIMINATOR,
        iterations = CRYPTO_PBKDF_ITERATIONS_MIN,
        saltLength = 32,
        verifierLength,
    }: WindowRequestOptions = {}): Promise<AdministratorCommissioning.OpenCommissioningWindowRequest> {
        const crypto = this.node.env.get(Crypto);
        const salt = crypto.randomBytes(saltLength);
        const pakePasscodeVerifier =
            verifierLength === undefined
                ? await PaseClient.generatePakePasscodeVerifier(crypto, PASSCODE, {
                      iterations: CRYPTO_PBKDF_ITERATIONS_MIN,
                      salt,
                  })
                : crypto.randomBytes(verifierLength);
        return { commissioningTimeout, pakePasscodeVerifier, discriminator, iterations, salt };
    }

    async openWindow(options?: WindowRequestOptions, exchange?: MessageExchange) {
        return await this.#invoke(
            Invoke.ConcreteCommandRequest({
                endpoint: this.node,
                cluster: AdministratorCommissioning,
                command: "openCommissioningWindow",
                fields: await this.windowRequest(options),
            }),
            exchange,
        );
    }

    async openBasicWindow(commissioningTimeout = 180, exchange?: MessageExchange) {
        return await this.#invoke(
            Invoke.ConcreteCommandRequest({
                endpoint: this.node,
                cluster: AdministratorCommissioning,
                command: "openBasicCommissioningWindow",
                fields: { commissioningTimeout },
            }),
            exchange,
        );
    }

    async revoke() {
        return await this.#invoke(
            Invoke.ConcreteCommandRequest({
                endpoint: this.node,
                cluster: AdministratorCommissioning,
                command: "revokeCommissioning",
            }),
        );
    }

    async armFailSafe(exchange?: MessageExchange) {
        exchange ??= await this.caseExchange();
        await MockTime.resolve(
            this.node.online({ command: true, exchange }, agent =>
                agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 60, breadcrumb: 1 }),
            ),
        );
    }

    /**
     * Runs a timed invoke through the interaction layer without client-side validation, so fields out of their
     * constraints reach the device.  Returns the status of the single command.
     */
    async #invoke(command: Invoke.CommandRequest, exchange?: MessageExchange) {
        exchange ??= await this.caseExchange();
        const request = {
            ...Invoke({ timed: true, skipValidation: true, commands: [command] }),
            suppressResponse: false,
        };
        const chunks = await MockTime.resolve(
            this.node.online({ command: true, timed: true, exchange }, async ({ context }) => {
                const response = new CommandInvokeResponse(this.node.protocol, context);
                const chunks = new Array<InvokeResult.Data>();
                for await (const chunk of response.process(request)) {
                    chunks.push(...chunk);
                }
                return chunks;
            }),
        );
        expect(chunks.length).equals(1);
        const [result] = chunks;
        if (result.kind !== "cmd-status") {
            expect.fail(`expected a command status, got ${result.kind}`);
        }
        return { status: result.status, clusterStatus: result.clusterStatus };
    }
}

class RecordingAdvertisement extends Advertisement<ServiceDescription.Commissionable> {
    protected async run() {}

    isDuplicate(other: Advertisement): boolean {
        return other !== this && other.isCommissioning();
    }
}

/**
 * Keeps the commissionable descriptions the device advertises, in place of DNS-SD.
 */
class RecordingAdvertiser extends Advertiser {
    protected getAdvertisement(description: ServiceDescription) {
        if (description.kind !== "commissionable") {
            return undefined;
        }
        return new RecordingAdvertisement(this, "commissionable", description);
    }

    get commissionable() {
        return [...this.advertisements].flatMap(({ description }) =>
            description.kind === "commissionable"
                ? [{ mode: description.mode, discriminator: description.discriminator }]
                : [],
        );
    }

    static for(device: Device) {
        const advertiser = new RecordingAdvertiser();
        device.node.env.get(DeviceAdvertiser).addAdvertiser(advertiser);
        return advertiser;
    }
}

describe("AdministratorCommissioningServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("OpenCommissioningWindow", () => {
        // § 11.19.7.2: "this attribute SHALL indicate the FabricIndex associated with the Fabric scoping of the
        // Administrator that opened the window"; § 11.19.7.3: "This field SHALL match the VendorID field of the Fabrics
        // attribute list entry associated with the Administrator having opened the window"
        it("reports an enhanced window and its opener", async () => {
            await using device = await Device.create();

            expect(await device.openWindow()).deep.equals(success);

            expect(device.attributes).deep.equals({ windowStatus: EnhancedWindowOpen, ...device.opener });
        });

        // § 11.19.8.1.3: "This field SHALL be used by the Node as the long discriminator for DNS-SD advertisement"
        it("advertises in enhanced commissioning mode with the requested discriminator", async () => {
            await using device = await Device.create();
            const advertiser = RecordingAdvertiser.for(device);

            await device.openWindow({ discriminator: 4095 });

            expect(advertiser.commissionable).deep.equals([{ mode: CommissioningMode.Enhanced, discriminator: 4095 }]);
        });

        // § 11.19.8.1.1 refers to § 5.4.2.3, which bounds a window opened by command to 3 to 15 minutes
        for (const commissioningTimeout of [180, 900]) {
            it(`accepts a timeout of ${commissioningTimeout} s`, async () => {
                await using device = await Device.create();

                expect(await device.openWindow({ commissioningTimeout })).deep.equals(success);
                expect(device.attributes.windowStatus).equals(EnhancedWindowOpen);
            });
        }

        // § 11.19.8.1: "In case of any other parameter error, this command SHALL fail with a status code of
        // COMMAND_INVALID."
        for (const commissioningTimeout of [179, 901]) {
            it(`answers INVALID_COMMAND to a timeout of ${commissioningTimeout} s`, async () => {
                await using device = await Device.create();

                expect(await device.openWindow({ commissioningTimeout })).deep.equals(statusOf(Status.InvalidCommand));
                expect(device.attributes).deep.equals(closedAttributes);
            });
        }

        it("answers INVALID_COMMAND to a discriminator above 4095", async () => {
            await using device = await Device.create();

            expect(await device.openWindow({ discriminator: 4096 })).deep.equals(statusOf(Status.InvalidCommand));
            expect(device.attributes).deep.equals(closedAttributes);
        });

        // § 11.19.8.1: "If any format or validity errors related to the PAKEPasscodeVerifier, Iterations or Salt
        // arguments arise, this command SHALL fail with a cluster specific status code of PAKEParameterError."
        const invalidPakeParameters: [string, WindowRequestOptions][] = [
            ["a verifier of 96 bytes", { verifierLength: 96 }],
            ["a verifier of 98 bytes", { verifierLength: 98 }],
            ["999 iterations", { iterations: CRYPTO_PBKDF_ITERATIONS_MIN - 1 }],
            ["100001 iterations", { iterations: CRYPTO_PBKDF_ITERATIONS_MAX + 1 }],
            ["a salt of 15 bytes", { saltLength: 15 }],
            ["a salt of 33 bytes", { saltLength: 33 }],
        ];
        for (const [description, options] of invalidPakeParameters) {
            it(`answers PAKEParameterError to ${description}`, async () => {
                await using device = await Device.create();

                expect(await device.openWindow(options)).deep.equals(failure(PakeParameterError));
                expect(device.attributes).deep.equals(closedAttributes);
            });
        }

        const validPakeParameters: [string, WindowRequestOptions][] = [
            ["100000 iterations and a salt of 16 bytes", { iterations: CRYPTO_PBKDF_ITERATIONS_MAX, saltLength: 16 }],
            ["1000 iterations and a salt of 32 bytes", { iterations: CRYPTO_PBKDF_ITERATIONS_MIN, saltLength: 32 }],
        ];
        for (const [description, options] of validPakeParameters) {
            it(`accepts ${description}`, async () => {
                await using device = await Device.create();

                expect(await device.openWindow(options)).deep.equals(success);
            });
        }

        // § 11.19.8.1: "If a commissioning window is already currently open, this command SHALL fail with a cluster
        // specific status code of Busy."
        it("answers Busy while an administrator's basic window is open", async () => {
            await using device = await Device.create(BasicCapableRootEndpoint);
            await device.openBasicWindow();

            expect(await device.openWindow()).deep.equals(failure(Busy));
            expect(device.attributes.windowStatus).equals(BasicWindowOpen);
        });

        // § 11.19.8.1: "If the fail-safe timer is currently armed, this command SHALL fail with a cluster specific
        // status code of Busy"
        it("answers Busy while the fail-safe is armed", async () => {
            await using device = await Device.create();
            await device.armFailSafe();

            expect(await device.openWindow()).deep.equals(failure(Busy));
            expect(device.attributes).deep.equals(closedAttributes);
        });

        // The specification sets no order among the failures; CHIP checks Busy before the PAKE parameters
        it("answers Busy before it checks the PAKE parameters", async () => {
            await using device = await Device.create();
            await device.openWindow();

            expect(await device.openWindow({ saltLength: 15 })).deep.equals(failure(Busy));
        });

        // § 11.19.7.1: "This attribute SHALL revert to WindowNotOpen upon expiry of a commissioning window."
        // § 11.19.8.1: "When the OpenCommissioningWindow command expires [...] the Node SHALL [...] stop publishing the
        // DNS-SD record corresponding to this command"
        it("closes the window, resets the attributes and stops advertising once the timeout expires", async () => {
            await using device = await Device.create();
            const advertiser = RecordingAdvertiser.for(device);
            await device.openWindow({ commissioningTimeout: 300 });

            await MockTime.advance(Seconds(299));
            expect(device.attributes.windowStatus).equals(EnhancedWindowOpen);

            await MockTime.advance(Seconds(2));
            await MockTime.macrotasks;

            expect(device.attributes).deep.equals(closedAttributes);
            expect(advertiser.commissionable).deep.equals([]);
            expect(await device.openWindow()).deep.equals(success);
        });

        // § 11.19.7.2: "If, during an open commissioning window, the fabric for the Administrator that opened the
        // window is removed, then this attribute SHALL be set to null."  § 11.19.7.3: "If the fabric for the
        // Administrator that opened the window is removed from the node while the commissioning window is still open,
        // this attribute SHALL NOT be updated."
        it("clears only AdminFabricIndex when the opener's fabric is removed", async () => {
            await using device = await Device.create();
            await device.node.addFabric();
            await device.openWindow();
            const { adminVendorId } = device.opener;

            await MockTime.resolve(device.node.env.get(FabricManager).for(device.fabric.fabricIndex).delete());

            expect(device.attributes).deep.equals({
                windowStatus: EnhancedWindowOpen,
                adminFabricIndex: null,
                adminVendorId,
            });
        });

        it("answers PAKEParameterError on a session without fabric", async () => {
            await using device = await Device.create();

            expect(await device.openWindow({}, await device.paseExchange())).deep.equals(failure(PakeParameterError));
        });

        it("answers PAKEParameterError on a session without fabric that armed the fail-safe", async () => {
            await using device = await Device.create();
            const exchange = await device.paseExchange();
            await device.armFailSafe(exchange);

            expect(await device.openWindow({}, exchange)).deep.equals(failure(PakeParameterError));
        });

        it("opens no window on a session without fabric and accepts the next window", async () => {
            await using device = await Device.create();

            await device.openWindow({}, await device.paseExchange());
            expect(device.commissioner.windowStatus).equals(WindowNotOpen);
            expect(device.attributes).deep.equals(closedAttributes);

            expect(await device.openWindow()).deep.equals(success);
            expect(device.attributes.windowStatus).equals(EnhancedWindowOpen);
        });
    });

    describe("OpenBasicCommissioningWindow", () => {
        it("reports a basic window and its opener and advertises in basic commissioning mode", async () => {
            await using device = await Device.create(BasicCapableRootEndpoint);
            const advertiser = RecordingAdvertiser.for(device);

            expect(await device.openBasicWindow()).deep.equals(success);

            expect(device.attributes).deep.equals({ windowStatus: BasicWindowOpen, ...device.opener });
            expect(advertiser.commissionable).deep.equals([
                { mode: CommissioningMode.Basic, discriminator: device.node.state.commissioning.discriminator },
            ]);
        });

        // § 11.19.8.2: "In case of any other parameter error, this command SHALL fail with a status code of
        // COMMAND_INVALID."
        for (const commissioningTimeout of [179, 901]) {
            it(`answers INVALID_COMMAND to a timeout of ${commissioningTimeout} s`, async () => {
                await using device = await Device.create(BasicCapableRootEndpoint);

                expect(await device.openBasicWindow(commissioningTimeout)).deep.equals(statusOf(Status.InvalidCommand));
                expect(device.attributes).deep.equals(closedAttributes);
            });
        }

        // § 11.19.8.2: "If a commissioning window is already currently open, this command SHALL fail with a cluster
        // specific status code of Busy."
        it("answers Busy while an administrator's enhanced window is open", async () => {
            await using device = await Device.create(BasicCapableRootEndpoint);
            await device.openWindow();

            expect(await device.openBasicWindow()).deep.equals(failure(Busy));
            expect(device.attributes.windowStatus).equals(EnhancedWindowOpen);
        });

        it("answers PAKEParameterError on a session without fabric", async () => {
            await using device = await Device.create(BasicCapableRootEndpoint);

            expect(await device.openBasicWindow(180, await device.paseExchange())).deep.equals(
                failure(PakeParameterError),
            );
            expect(device.attributes).deep.equals(closedAttributes);
        });

        // § 11.19.8.2: "If the fail-safe timer is currently armed, this command SHALL fail with a cluster specific
        // status code of Busy"
        it("answers Busy while the fail-safe is armed", async () => {
            await using device = await Device.create(BasicCapableRootEndpoint);
            await device.armFailSafe();

            expect(await device.openBasicWindow()).deep.equals(failure(Busy));
            expect(device.attributes).deep.equals(closedAttributes);
        });
    });

    describe("RevokeCommissioning", () => {
        // § 11.19.8.3.1: "If the commissioning window was NOT open at the time of receipt, the Node SHALL return a
        // cluster specific status code of WindowNotOpen."
        it("answers WindowNotOpen when no window is open", async () => {
            await using device = await Device.create();

            expect(await device.revoke()).deep.equals(failure(WindowNotOpenCode));
        });

        // § 11.19.8.3.1 step 3: "stop publishing the DNS-SD records [...] expire the commissioning window and set the
        // WindowStatus attribute to WindowNotOpen"
        it("stops advertising, resets the attributes and accepts the next window", async () => {
            await using device = await Device.create();
            const advertiser = RecordingAdvertiser.for(device);
            await device.openWindow();

            expect(await device.revoke()).deep.equals(success);

            expect(advertiser.commissionable).deep.equals([]);
            expect(device.attributes).deep.equals(closedAttributes);
            expect(await device.openWindow()).deep.equals(success);
        });

        // § 11.19.8.3.1 step 1: "The Node SHALL perform the following actions regardless of current commissioning
        // window state: [...] terminate any open PASE sessions [...] immediately expire any fail-safe held by an open
        // PASE session"
        it("terminates the PASE session before it answers WindowNotOpen", async () => {
            await using device = await Device.create();
            await device.paseExchange();
            const sessions = device.node.env.get(SessionManager);
            expect(sessions.getPaseSession()).not.undefined;

            expect(await device.revoke()).deep.equals(failure(WindowNotOpenCode));

            expect(sessions.getPaseSession()).undefined;
        });

        it("expires the fail-safe of the PASE session before it answers WindowNotOpen", async () => {
            await using device = await Device.create();
            await device.armFailSafe(await device.paseExchange());
            expect(device.commissioner.isFailsafeArmed).true;

            expect(await device.revoke()).deep.equals(failure(WindowNotOpenCode));

            expect(device.commissioner.isFailsafeArmed).false;
        });
    });
});
