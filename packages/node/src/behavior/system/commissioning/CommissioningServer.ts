/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubscriptionsBehavior } from "#behavior/system/subscriptions/SubscriptionsServer.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import {
    AsyncObservable,
    Bytes,
    Crypto,
    Diagnostic,
    EventEmitter,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterFlowError,
    Mutex,
    MutexClosedError,
    Observable,
} from "#general";
import { DatatypeModel, FieldElement } from "#model";
import type { Node } from "#node/Node.js";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    BleAdvertiser,
    CommissioningConfigProvider,
    DeviceAdvertiser,
    DeviceCommissioner,
    ExposedFabricInformation,
    FabricManager,
    FailsafeContext,
    MdnsAdvertiser,
    PaseClient,
    Val,
} from "#protocol";
import {
    CommissioningFlowType,
    CommissioningOptions,
    DiscoveryCapabilitiesSchema,
    FabricIndex,
    ManualPairingCodeCodec,
    QrCode,
    QrPairingCodeCodec,
} from "#types";
import { BasicInformationBehavior } from "../../../behaviors/basic-information/BasicInformationBehavior.js";
import { OperationalCredentialsBehavior } from "../../../behaviors/operational-credentials/OperationalCredentialsBehavior.js";
import { Behavior } from "../../Behavior.js";
import { ActionContext } from "../../context/ActionContext.js";
import { NetworkServer } from "../network/NetworkServer.js";
import { ProductDescriptionServer } from "../product-description/ProductDescriptionServer.js";
import { SessionsBehavior } from "../sessions/SessionsBehavior.js";

const logger = Logger.get("Commissioning");

/**
 * Server behavior related to commissioning.
 *
 * Updates node state based on commissioning status.
 */
export class CommissioningServer extends Behavior {
    static override readonly id = "commissioning";

    declare state: CommissioningServer.State;
    declare events: CommissioningServer.Events;
    declare internal: CommissioningServer.Internal;

    static override early = true;

    override initialize() {
        // This provides a name for the mutex error handler
        this.internal.name = this.toString();

        if (this.state.passcode === -1) {
            this.state.passcode = PaseClient.generateRandomPasscode(this.env.get(Crypto));
        } else if (CommissioningOptions.FORBIDDEN_PASSCODES.includes(this.state.passcode)) {
            throw new ImplementationError(`Passcode ${this.state.passcode} is not allowed`);
        }

        if (this.state.discriminator === -1) {
            this.state.discriminator = PaseClient.generateRandomDiscriminator(this.env.get(Crypto));
        }

        this.reactTo((this.endpoint as Node).lifecycle.partsReady, this.#initializeNode);

        // Ensure the environment conveys commissioning configuration to the DeviceCommissioner
        if (!this.env.has(CommissioningConfigProvider)) {
            // Configure the DeviceCommissioner
            this.env.set(
                CommissioningConfigProvider,
                new CommissioningServerConfigProvider(this.endpoint as ServerNode),
            );
        }

        this.reactTo((this.endpoint as Node).lifecycle.online, this.#enterOnlineMode);

        this.reactTo((this.endpoint as Node).lifecycle.goingOffline, this.#enterOfflineMode);
    }

    override async [Symbol.asyncDispose]() {
        // Ensure dependencies are cleaned up
        this.#enterOfflineMode();

        // Wait for cleanup to finish
        await this.internal.mutex;
    }

    handleFabricChange(fabricIndex: FabricIndex, fabricAction: CommissioningServer.FabricAction) {
        // Do not consider commissioned so long as there is an active failsafe timer as commissioning may not be
        // complete and could still be rolled back
        if (this.env.has(FailsafeContext)) {
            const failsafe = this.env.get(FailsafeContext);
            if (fabricAction === "added" || fabricAction === "updated") {
                // Added or updated fabric with active Failsafe are temporary and should not be considered until failsafe ends
                if (failsafe.construction.status !== Lifecycle.Status.Destroyed) {
                    if (failsafe.fabricIndex === fabricIndex) {
                        this.#monitorFailsafe(failsafe);
                        return;
                    } else {
                        throw new MatterFlowError(
                            `Failsafe owns a different fabricIndex then ${failsafe.forUpdateNoc ? "updated" : "added"}: ${failsafe.fabricIndex} vs. ${fabricIndex}`,
                        );
                    }
                }
            } else if (fabricAction === "deleted") {
                // Removed fabric with active Failsafe are ignored but should match the failsafe one
                if (failsafe.fabricIndex !== fabricIndex) {
                    throw new MatterFlowError(
                        `Failsafe owns a different fabricIndex then removed: ${failsafe.fabricIndex} vs. ${fabricIndex}`,
                    );
                }
            }
        }

        const commissioned = !!this.env.get(FabricManager).fabrics.length;

        let doFactoryReset = false;
        if (commissioned !== this.state.commissioned) {
            this.state.commissioned = commissioned;
            if (commissioned) {
                this.events.commissioned.emit(this.context);
                (this.endpoint.lifecycle as NodeLifecycle).commissioned.emit(this.context);
            } else {
                this.events.decommissioned.emit(this.context);
                (this.endpoint.lifecycle as NodeLifecycle).decommissioned.emit(this.context);

                doFactoryReset = true;
            }
        }

        this.events.fabricsChanged.emit(fabricIndex, fabricAction);

        if (doFactoryReset) {
            const sessions = this.agent.get(SessionsBehavior);
            if (Object.keys(sessions.state.sessions).length > 0) {
                // We have still open sessions, wait for them to close
                this.reactTo(sessions.events.closed, this.#resetAfterSessionsClear);
            } else {
                this.#triggerFactoryReset();
            }
        }
    }

    #resetAfterSessionsClear() {
        const sessions = this.agent.get(SessionsBehavior);
        if (Object.keys(sessions.state.sessions).length === 0) {
            this.#triggerFactoryReset();
        }
    }

    #triggerFactoryReset() {
        this.env.runtime.add((this.endpoint as ServerNode).erase().catch(e => MutexClosedError.accept(e)));
    }

    #monitorFailsafe(failsafe: FailsafeContext) {
        if (this.internal.unregisterFailsafeListener) {
            return;
        }

        // Callback that listens to the failsafe for destruction and triggers commissioning status update
        const listener = this.callback(function (this: CommissioningServer, status: Lifecycle.Status) {
            if (status === Lifecycle.Status.Destroyed) {
                if (failsafe.fabricIndex !== undefined) {
                    this.handleFabricChange(failsafe.fabricIndex, failsafe.forUpdateNoc ? "updated" : "added");
                }
                this.internal.unregisterFailsafeListener?.();
            }
        });

        // Callback that removes above listener
        this.internal.unregisterFailsafeListener = this.callback(function (this: CommissioningServer) {
            failsafe.construction.change.off(listener);
            this.internal.unregisterFailsafeListener = undefined;
        });

        // Register the listener
        failsafe.construction.change.on(listener);
    }

    async #enterOnlineMode() {
        this.reactTo(this.env.get(FabricManager).events.added, this.enterOperationalMode);

        // If already commissioned, trigger operational announcement
        if ((this.endpoint.lifecycle as NodeLifecycle).isCommissioned) {
            // Restore subscriptions if we have some persisted
            await this.endpoint.act(agent => agent.get(SubscriptionsBehavior).reestablishFormerSubscriptions());

            this.enterOperationalMode();
            return;
        }

        // Skip auto commissioning if disabled
        if (this.state.enabled === false) {
            return;
        }

        // ...or if node is commissioned
        if (this.env.get(FabricManager).fabrics.length) {
            return;
        }

        // ...or the node has no advertisable device type
        if (!this.#hasAdvertisableDeviceType) {
            return;
        }

        // Advertise as commissionable
        await this.enterCommissionableMode();
    }

    #enterOfflineMode() {
        this.internal.mutex.run(async () => {
            await this.env.close(DeviceCommissioner);
            this.env.delete(CommissioningConfigProvider);
            this.internal.unregisterFailsafeListener?.();
            await this.env.close(FailsafeContext);
        });
    }

    /**
     * An uncommissioned node is not yet associated with fabrics.  It cannot be used until commissioned by a controller.
     *
     * The server normally invokes this method when the node starts and is not yet commissioned.  You can disable by
     * setting {@link CommissioningServer.State#enabled} to false.  Then you must invoke yourself.
     */
    async enterCommissionableMode() {
        if (!this.#hasAdvertisableDeviceType) {
            throw new ImplementationError(
                `Node ${this.endpoint} has no endpoints with advertisable device types; you must add an endpoint or set the device type`,
            );
        }

        await this.env.get(DeviceCommissioner).allowBasicCommissioning();

        this.initiateCommissioning();
    }

    /**
     * The server invokes this method when the node starts and is already commissioned, or immediately after
     * commissioning.
     */
    protected enterOperationalMode() {
        if (!(this.endpoint.lifecycle as NodeLifecycle).isOnline) {
            throw new ImplementationError("Cannot advertise offline server");
        }

        this.env.get(DeviceAdvertiser).enterOperationalMode();
    }

    /**
     * Display instructions on commissioning the device.
     *
     * The default implementation logs the QR code and credentials.
     */
    protected initiateCommissioning() {
        const { passcode, discriminator } = this.state;

        const { qrPairingCode, manualPairingCode } = this.state.pairingCodes;

        logger.notice(
            Diagnostic.strong(this.endpoint.toString()),
            "is uncommissioned",
            Diagnostic.dict({
                passcode,
                discriminator,
                "manual pairing code": manualPairingCode,
            }),
            Diagnostic.list([
                QrCode.get(qrPairingCode).trim(),
                `QR code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}\n`,
            ]),
        );
    }

    /**
     * Define logical schema to make passcode and discriminator persistent.
     */
    static override readonly schema = new DatatypeModel({
        name: "CommissioningState",
        type: "struct",

        children: [
            FieldElement({ name: "passcode", type: "uint32", quality: "N" }),
            FieldElement({ name: "discriminator", type: "uint16", quality: "N" }),
        ],
    });

    #initializeNode() {
        this.state.commissioned = !!this.agent.get(OperationalCredentialsBehavior).state.commissionedFabrics;
        (this.endpoint.lifecycle as NodeLifecycle).initialized.emit(this.state.commissioned);
    }

    get #hasAdvertisableDeviceType() {
        return this.agent.get(ProductDescriptionServer).state.deviceType !== EndpointType.UNKNOWN_DEVICE_TYPE;
    }
}

export namespace CommissioningServer {
    export interface PairingCodes {
        manualPairingCode: string;
        qrPairingCode: string;
    }

    export class Internal {
        unregisterFailsafeListener?: () => void = undefined;

        /**
         * We use this to synchronize internal state transitions that would otherwise have race conditions due to the
         * large number of asynchronous calls.
         */
        mutex = new Mutex({
            toString: () => this.name,
        });

        /**
         * Passed to the mutex for error handling purposes
         */
        name = "?";
    }

    export class State {
        enabled?: boolean;
        commissioned = false;
        fabrics: Record<FabricIndex, ExposedFabricInformation> = {};
        passcode = -1;
        discriminator = -1;
        flowType = CommissioningFlowType.Standard;
        additionalBleAdvertisementData?: Bytes = undefined;
        pairingCodes = {} as PairingCodes;
        mdns?: MdnsAdvertiser.Options;
        ble?: BleAdvertiser.Options;

        [Val.properties](endpoint: Endpoint) {
            const comm = this;
            return {
                get pairingCodes() {
                    const bi = endpoint.stateOf(BasicInformationBehavior);
                    const net = endpoint.stateOf(NetworkServer);

                    const qrPairingCode = QrPairingCodeCodec.encode([
                        {
                            version: 0,
                            vendorId: bi.vendorId,
                            productId: bi.productId,
                            flowType: comm.flowType,
                            discriminator: comm.discriminator,
                            passcode: comm.passcode,
                            discoveryCapabilities: DiscoveryCapabilitiesSchema.encode(net.discoveryCapabilities),
                        },
                    ]);

                    return {
                        manualPairingCode: ManualPairingCodeCodec.encode({
                            // We use -1 to flag "need generated value" but this will crash the pairing code generator.  So use 0
                            // so we don't throw an error during initialization
                            discriminator: comm.discriminator < 0 ? 0 : comm.discriminator,
                            passcode: comm.passcode < 0 ? 0 : comm.passcode,
                        }),
                        qrPairingCode,
                    };
                },

                get fabrics() {
                    const exposedFabrics: Record<FabricIndex, ExposedFabricInformation> = {};
                    endpoint.env
                        .get(FabricManager)
                        .fabrics.forEach(
                            ({ fabricIndex, externalInformation }) =>
                                (exposedFabrics[fabricIndex] = externalInformation),
                        );
                    return exposedFabrics;
                },
            };
        }
    }

    export class Events extends EventEmitter {
        commissioned = Observable<[context: ActionContext]>();
        decommissioned = Observable<[context: ActionContext]>();
        fabricsChanged = Observable<[fabricIndex: FabricIndex, action: FabricAction]>();
        enabled$Changed = AsyncObservable<[context: ActionContext]>();
    }

    export type FabricAction = "added" | "deleted" | "updated";
}

/**
 * Conveys configuration information to {@link DeviceCommissioner}.
 */
class CommissioningServerConfigProvider extends CommissioningConfigProvider {
    #node: ServerNode;

    constructor(node: ServerNode) {
        super();

        this.#node = node;
    }

    override get values() {
        const { commissioning, productDescription, network } = this.#node.state;

        const config = {
            ...commissioning,
            productDescription,
            ble: !!network.ble,
        };

        return config as CommissioningOptions.Configuration;
    }
}
