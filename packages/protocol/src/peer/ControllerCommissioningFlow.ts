/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { ClientRead } from "#action/client/ClientRead.js";
import { Invoke } from "#action/request/Invoke.js";
import { Read } from "#action/request/Read.js";
import { Certificate } from "#certificate/kinds/Certificate.js";
import { BasicInformation } from "#clusters/basic-information";
import { Descriptor } from "#clusters/descriptor";
import { GeneralCommissioning } from "#clusters/general-commissioning";
import { NetworkCommissioning } from "#clusters/network-commissioning";
import { OperationalCredentials } from "#clusters/operational-credentials";
import { TimeSynchronizationCluster } from "#clusters/time-synchronization";
import {
    Bytes,
    ChannelType,
    Diagnostic,
    Duration,
    ImplementationError,
    Instant,
    Logger,
    Millis,
    Minutes,
    repackErrorAs,
    Seconds,
    Time,
    Timespan,
    Timestamp,
    UnexpectedDataError,
} from "#general";
import {
    ClusterId,
    ClusterType,
    EndpointNumber,
    FabricIndex,
    Status,
    StatusResponseError,
    TypeFromPartialBitSchema,
    TypeFromSchema,
    VendorId,
} from "#types";
import { CertificateAuthority } from "../certificate/CertificateAuthority.js";
import { ClusterClientObj } from "../cluster/client/ClusterClientTypes.js";
import { TlvCertSigningRequest } from "../common/OperationalCredentialsTypes.js";
import { Fabric } from "../fabric/Fabric.js";
import { CommissioningError } from "./CommissioningError.js";
import { PeerAddress } from "./PeerAddress.js";

const logger = Logger.get("ControllerCommissioner");

/**
 * User specific options for the Commissioning process
 */
export type ControllerCommissioningFlowOptions = {
    /**
     * The regulatory location (indoor or outdoor) where the device is used.
     */
    regulatoryLocation: GeneralCommissioning.RegulatoryLocationType;

    /**
     * The country where the device is used.
     */
    regulatoryCountryCode: string;

    /**
     * The vendor ID we present as a commissioner.
     */
    adminVendorId?: VendorId;

    /**
     * Required credentials if the device is to connect to a wifi network provide the credentials here.
     */
    wifiNetwork?: {
        wifiSsid: string;
        wifiCredentials: string;
    };

    /**
     * If the device should connect to a thread network.
     */
    threadNetwork?: {
        networkName: string;
        operationalDataset: string;
    };
};

/** Types representation of a general commissioning response. */
type CommissioningSuccessFailureResponse = {
    errorCode: number;
    debugText?: string;
};

/** Result code of a single commissioning step. */
enum CommissioningStepResultCode {
    Success,
    Failure,
    Skipped,
    Stop,
}

/**
 * Result of a single commissioning step
 * Breadcrump value is stored for each step for transparency
 */
type CommissioningStepResult = {
    code: CommissioningStepResultCode;
    breadcrumb: number;
};

/**
 * Definition of one commissioning step
 * All steps are for execution sorted by stepNumber and subStepNumber
 */
type CommissioningStep = {
    /** Step Number according to the specs */
    stepNumber: number;

    /** Order of actions within a step */
    subStepNumber: number;

    /** Name of the action or step */
    name: string;

    /** Logic function to execute */
    stepLogic: () => Promise<CommissioningStepResult>;

    /** Optional flag to indicate that the failsafe timer should be rearmed in any case before this step. */
    reArmFailsafe?: boolean;
};

/** Data that are collected initially or through the commissioning process and can be used also by other steps. */
type CollectedCommissioningData = {
    basicCommissioningInfo?: TypeFromSchema<typeof GeneralCommissioning.TlvBasicCommissioningInfo>;
    productName?: string;
    networkFeatures?: {
        endpointId: number;
        value: TypeFromPartialBitSchema<typeof NetworkCommissioning.Complete.features>;
    }[];
    networkStatus?: { endpointId: number; value: TypeFromSchema<typeof NetworkCommissioning.TlvNetworkInfo>[] }[];
    rootPartsList?: EndpointNumber[];
    rootServerList?: ClusterId[];
    vendorId?: VendorId;
    productId?: number;
    supportsConcurrentConnection?: boolean;
    successfullyConnectedToNetwork?: boolean;
    fabricIndex?: FabricIndex;
};

/** The number of fabrics that can be commissioned is already reached. */
export class MaximumCommissionedFabricsReachedError extends CommissioningError {}

/** The commissioning process could not be finished within the maximum allowed commissioning timeframe. */
export class CommissioningTimeoutError extends CommissioningError {}

/** Error that throws when the device is already commissioned to this fabric. */
export class DeviceAlreadyCommissionedToThisFabricError extends CommissioningError {}

/** Error that throws when the device is already commissioned to another fabric with the same label. */
export class FabricLabelConflictError extends CommissioningError {}

/** Error that throws when the device has no connected network and no credentials for Wifi or Thread network were configured. */
export class WifiOrThreadNetworkCredentialsNotConfiguredError extends CommissioningError {}

/** Error that throws when the setup for the provided Wifi network failed. */
export class WifiNetworkSetupFailedError extends CommissioningError {}

/** Error that throws when the setup for the provided Thread network failed. */
export class ThreadNetworkSetupFailedError extends CommissioningError {}

/** Error that throws when the NodeId is already used in the fabric. */
export class NodeIdConflictError extends CommissioningError {}

/** Error that throws when the device could not be connected using the operational discovery and no session could be created. */
export class OperativeConnectionFailedError extends CommissioningError {}

/** Error that throws when Commissioning fails but a process can be continued. */
class RecoverableCommissioningError extends CommissioningError {}

const DEFAULT_FAILSAFE_TIME = Minutes.one;

const RootEndpointNumber = EndpointNumber(0);

/**
 * Class to abstract the Device commission flow in a step wise way as defined in Specs. The specs are not 100%
 */
export class ControllerCommissioningFlow {
    protected interaction: ClientInteraction;
    protected readonly ca: CertificateAuthority;
    protected readonly fabric: Fabric;
    protected readonly transitionToCase: (
        peerAddress: PeerAddress,
        supportsConcurrentConnections: boolean,
    ) => Promise<ClientInteraction | undefined>;
    protected readonly commissioningOptions: ControllerCommissioningFlowOptions;
    protected readonly commissioningSteps = new Array<CommissioningStep>();
    protected readonly commissioningStepResults = new Map<string, CommissioningStepResult>();
    readonly #clusterClients = new Map<ClusterId, ClusterClientObj>();
    #commissioningStartedTime: Timestamp | undefined;
    #commissioningExpiryTime: Timestamp | undefined;
    #currentFailSafeEndTime: Timestamp | undefined;
    protected lastBreadcrumb = 1;
    protected collectedCommissioningData: CollectedCommissioningData = {};
    #defaultFailSafeTime = DEFAULT_FAILSAFE_TIME;

    constructor(
        /** ClientInteraction for the initiated PASE session */
        interaction: ClientInteraction,

        /** CertificateAuthority of the controller. */
        ca: CertificateAuthority,

        /** Fabric of the controller. */
        fabric: Fabric,

        /** Commissioning options for the commissioning process. */
        commissioningOptions: ControllerCommissioningFlowOptions,

        /** Callback that establishes CASE connection or handles final commissioning */
        transitionToCase: (
            peerAddress: PeerAddress,
            supportsConcurrentConnections: boolean,
        ) => Promise<ClientInteraction | undefined>,
    ) {
        this.interaction = interaction;
        this.ca = ca;
        this.fabric = fabric;
        this.transitionToCase = transitionToCase;
        this.commissioningOptions = commissioningOptions;
        logger.debug(`Commissioning options: ${Diagnostic.json(commissioningOptions)}`);
        this.#initializeCommissioningSteps();
    }

    /**
     * Execute the commissioning process in the defined order. The steps are sorted before execution based on the step
     * number and sub step number.
     * If >50% of the failsafe time has passed, the failsafe timer is re-armed (50% of 60s default are 30s and each
     * action is allowed to take 30s at minimum based on specs).
     */
    async executeCommissioning() {
        this.#sortSteps();

        let failSafeTimerReArmedAfterPreviousStep = false;
        for (const step of this.commissioningSteps) {
            logger.info(`Executing commissioning step ${step.stepNumber}.${step.subStepNumber}: ${step.name}`);
            try {
                if (step.reArmFailsafe && !failSafeTimerReArmedAfterPreviousStep) {
                    logger.debug(`Re-Arming failsafe timer before executing step`);
                    await this.#armFailsafe();
                }
                failSafeTimerReArmedAfterPreviousStep = false;
                const result = await step.stepLogic();
                this.#setCommissioningStepResult(step, result);

                if (this.#currentFailSafeEndTime !== undefined) {
                    if (this.#commissioningExpiryTime !== undefined && Time.nowMs > this.#commissioningExpiryTime) {
                        logger.error(
                            `Commissioning step ${step.stepNumber}.${step.subStepNumber}: ${step.name} succeeded, but commissioning took too long in general!`,
                        );
                        const maxTimeS =
                            this.collectedCommissioningData.basicCommissioningInfo?.maxCumulativeFailsafeSeconds;
                        throw new CommissioningTimeoutError(
                            `Commissioning time exceeds the maximum timeframe${maxTimeS ? ` of ${maxTimeS}s` : ""}`,
                        );
                    }

                    /**
                     * Commissioner SHALL re-arm the Fail-safe timer on the Commissionee to the desired commissioning
                     * timeout within 60 seconds of the completion of PASE session establishment, using the ArmFailSafe
                     * command (see Section 11.9.6.2, “ArmFailSafe Command”)
                     */
                    const timeLeft = Timespan(Time.nowMs, this.#currentFailSafeEndTime).duration;
                    if (timeLeft < this.#defaultFailSafeTime / 2) {
                        logger.info(
                            `After Commissioning step ${step.stepNumber}.${step.subStepNumber}: ${
                                step.name
                            } succeeded, ${timeLeft}s left for failsafe timer, re-arming failsafe`,
                        );
                        await this.#armFailsafe();
                        failSafeTimerReArmedAfterPreviousStep = true;
                    }
                }

                if (result.code === CommissioningStepResultCode.Stop) {
                    break;
                }
            } catch (error) {
                if (error instanceof RecoverableCommissioningError) {
                    logger.warn(
                        `Commissioning step ${step.stepNumber}.${step.subStepNumber}: ${step.name} failed with recoverable error: ${error.message} ... Continuing with process`,
                    );
                } else if (error instanceof CommissioningError || error instanceof StatusResponseError) {
                    logger.error(
                        `Commissioning step ${step.stepNumber}.${step.subStepNumber}: ${step.name} failed with error: ${error.message} ... Aborting commissioning`,
                    );
                    // TODO In concurrent connection commissioning flow, the failure of any of the steps 2 through 10
                    //  SHALL result in the Commissioner and Commissionee returning to step 2 (device discovery and
                    //  commissioning channel establishment) and repeating each step. The failure of any of the steps
                    //  11 through 15 in concurrent connection commissioning flow SHALL result in the Commissioner and
                    //  Commissionee returning to step 11 (configuration of operational network information). In the
                    //  case of failure of any of the steps 11 through 15 in concurrent connection commissioning flow,
                    //  the Commissioner and Commissionee SHALL reuse the existing PASE-derived encryption keys over
                    //  the commissioning channel and all steps up to and including step 10 are considered to have
                    //  been successfully completed.

                    // Commissioners that need to restart from step 2 MAY immediately expire the fail-safe by invoking
                    // the ArmFailSafe command with an ExpiryLengthSeconds field set to 0. Otherwise, Commissioners
                    // will need to wait until the current fail-safe timer has expired for the Commissionee to begin
                    // accepting PASE again.
                    await this.#resetFailsafeTimer();

                    StatusResponseError.accept(error);

                    // Convert error
                    throw repackErrorAs(error, CommissioningError);
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Convenience method to get a number of attributes in a read and return exactly these values in the order as
     * defined in the request
     */
    async #readConcreteAttributeValues(request: ClientRead) {
        const attributeMap = new Map<string, any>();
        if (request.attributeRequests === undefined) {
            throw new ImplementationError("Can only handle Attribute reads");
        }

        for (const { endpointId, clusterId, attributeId } of request.attributeRequests) {
            if (endpointId === undefined || clusterId === undefined) {
                continue;
            }
            attributeMap.set(`${endpointId}-${clusterId}-${attributeId}`, undefined);
        }
        for await (const data of this.interaction.read(request)) {
            for (const entry of data) {
                if (entry.kind !== "attr-value") {
                    continue;
                }
                const {
                    path: { endpointId, clusterId, attributeId },
                    value,
                } = entry;
                const key = `${endpointId}-${clusterId}-${attributeId}`;
                if (!attributeMap.has(key)) {
                    continue;
                }
                attributeMap.set(key, value);
            }
        }
        return [...attributeMap.values()];
    }

    // TODO improve response typing
    async #invokeCommand<const C extends ClusterType>(
        request: Invoke.ConcreteCommandRequest<C>,
        options: Omit<Invoke.Definition, "commands"> = {},
    ) {
        for await (const data of this.interaction.invoke(
            Invoke({
                commands: [request],
                ...options,
            }),
        )) {
            for (const entry of data) {
                // We send only one command, so we only get one response back
                switch (entry.kind) {
                    case "cmd-status":
                        if (entry.status !== Status.Success) {
                            throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                        }
                        return;

                    case "cmd-response":
                        return entry.data;
                }
            }
        }
    }

    /**
     * Initialize commissioning steps and add them in the default order as defined by
     * @see {@link MatterSpecification.v13.Core} § 5.5
     */
    #initializeCommissioningSteps() {
        this.commissioningSteps.push({
            stepNumber: 0, // Preparation
            subStepNumber: 1,
            name: "GetInitialData",
            stepLogic: () => this.#getInitialData(),
        });

        // Step 1: is outside of this class and requires to have relevant information needed by next steps
        // Step 2: is about discovery which is already done before this starts here
        // TODO Step 3-5: Commissioner handles/prepares for T&C Ack, if supported
        // Step 6: is the PASE session establishment which is done before this starts here

        this.commissioningSteps.push({
            stepNumber: 7,
            subStepNumber: 1,
            name: "GeneralCommissioning.ArmFailsafe",
            stepLogic: () => this.#armFailsafe(),
        });

        this.commissioningSteps.push({
            stepNumber: 8,
            subStepNumber: 1,
            name: "GeneralCommissioning.ConfigureRegulatoryInformation",
            stepLogic: () => this.#configureRegulatoryInformation(),
        });

        this.commissioningSteps.push({
            stepNumber: 8,
            subStepNumber: 2,
            name: "TimeSynchronization.SynchronizeTime",
            stepLogic: () => this.#synchronizeTime(),
        });

        // TODO Step 9: If device and Controller supports T&C Feature then User consent is handled

        this.commissioningSteps.push({
            stepNumber: 10,
            subStepNumber: 1,
            name: "OperationalCredentials.DeviceAttestation",
            stepLogic: () => this.#deviceAttestation(),
        });

        this.commissioningSteps.push({
            stepNumber: 11, // includes 11-13
            subStepNumber: 1,
            name: "OperationalCredentials.Certificates",
            stepLogic: () => this.#certificates(),
        });

        // TODO Step 14: TimeSynchronization.SetTrustedTimeSource if supported

        this.commissioningSteps.push({
            stepNumber: 15,
            subStepNumber: 1,
            name: "AccessControl",
            stepLogic: () => this.#configureAccessControlLists(),
        });

        // Care about Network commissioning only when we are on BLE, because else we are already on IP network
        if (this.interaction.channelType === ChannelType.BLE) {
            this.commissioningSteps.push({
                stepNumber: 16,
                subStepNumber: 1,
                name: "NetworkCommissioning.Validate",
                stepLogic: () => this.#validateNetwork(),
            });
            if (this.commissioningOptions.wifiNetwork !== undefined) {
                this.commissioningSteps.push({
                    stepNumber: 16, // includes step 17
                    subStepNumber: 2,
                    name: "NetworkCommissioning.Wifi",
                    reArmFailsafe: true,
                    stepLogic: () => this.#configureNetworkWifi(),
                });
            }
            if (this.commissioningOptions.threadNetwork !== undefined) {
                this.commissioningSteps.push({
                    stepNumber: 16, // includes step 17
                    subStepNumber: 3,
                    name: "NetworkCommissioning.Thread",
                    reArmFailsafe: true,
                    stepLogic: () => this.#configureNetworkThread(),
                });
            }
        } else {
            logger.info(
                `Skipping NetworkCommissioning steps because the device is already on IP network (${this.interaction.channelType})`,
            );
        }

        this.commissioningSteps.push({
            stepNumber: 18, // includes step 19 (CASE connection)
            subStepNumber: 1,
            name: "Reconnect",
            reArmFailsafe: true,
            stepLogic: () => this.#reconnectWithDevice(),
        });

        this.commissioningSteps.push({
            stepNumber: 20,
            subStepNumber: 1,
            name: "GeneralCommissioning.Complete",
            stepLogic: () => this.#completeCommissioning(),
        });

        this.commissioningSteps.push({
            stepNumber: 99, // Should be allowed in Step 13, but Tasmota is not supporting this
            subStepNumber: 1,
            name: "OperationalCredentials.UpdateFabricLabel",
            stepLogic: () => this.#updateFabricLabel(),
        });
    }

    #sortSteps() {
        this.commissioningSteps.sort((a, b) => {
            if (a.stepNumber !== b.stepNumber) return a.stepNumber - b.stepNumber;
            return a.subStepNumber - b.subStepNumber;
        });
    }

    #setCommissioningStepResult(step: CommissioningStep, result: CommissioningStepResult) {
        this.commissioningStepResults.set(`${step.stepNumber}-${step.subStepNumber}`, result);
    }

    getCommissioningStepResult(stepNumber: number, subStepNumber: number) {
        return this.commissioningStepResults.get(`${stepNumber}-${subStepNumber}`);
    }

    /** Helper method to check for errorCode/debugTest responses and throw error on failure */
    #ensureOperationalCredentialsSuccess(
        context: string,
        { statusCode, debugText, fabricIndex }: TypeFromSchema<typeof OperationalCredentials.TlvNocResponse>,
    ) {
        logger.debug(
            `Commissioning step ${context} returned ${OperationalCredentials.NodeOperationalCertStatus[statusCode]} (${statusCode}), ${debugText}${
                fabricIndex !== undefined ? `, fabricIndex: ${fabricIndex}` : ""
            }`,
        );

        if (statusCode === OperationalCredentials.NodeOperationalCertStatus.Ok) return;
        if (context === "addNoc") {
            // Let's return a bit more convenient error in this case
            if (statusCode === OperationalCredentials.NodeOperationalCertStatus.FabricConflict) {
                throw new DeviceAlreadyCommissionedToThisFabricError(
                    `Commission error: This device is already commissioned into this fabric. You cannot commission it again.`,
                );
            } else if (statusCode === OperationalCredentials.NodeOperationalCertStatus.TableFull) {
                throw new MaximumCommissionedFabricsReachedError(
                    `Commission error: This device reached the maximum number of fabrics it can be part of. Please remove a fabric before trying to add another one.`,
                );
            } else if (statusCode === OperationalCredentials.NodeOperationalCertStatus.LabelConflict) {
                throw new FabricLabelConflictError(
                    `Commission error: This device is already commissioned with a fabric with the same label. Please choose a different label.`,
                );
            }
        }
        throw new CommissioningError(
            `Commission error for "${context}": ${OperationalCredentials.NodeOperationalCertStatus[statusCode]} (${statusCode}), ${debugText}${
                fabricIndex !== undefined ? `, fabricIndex: ${fabricIndex}` : ""
            }`,
        );
    }

    /** Helper method to check for errorCode/debugTest responses and throw error on failure */
    #ensureGeneralCommissioningSuccess(context: string, { errorCode, debugText }: CommissioningSuccessFailureResponse) {
        logger.debug(`Commissioning step ${context} returned ${errorCode}, ${debugText}`);

        if (errorCode === GeneralCommissioning.CommissioningError.Ok) return;
        throw new CommissioningError(
            `Commission error for "${context}": ${GeneralCommissioning.CommissioningError[errorCode]} (${errorCode})${debugText ? `, ${debugText}` : ""}`,
        );
    }

    /**
     * Initial Step to receive some common data used by other steps
     */
    async #getInitialData() {
        const [
            supportedFabrics,
            commissionedFabrics,
            rootPartsList,
            rootServerList,
            vendorId,
            productId,
            productName,
            supportsConcurrentConnection,
        ] = await this.#readConcreteAttributeValues(
            Read(
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: OperationalCredentials.Complete,
                    attributes: ["supportedFabrics", "commissionedFabrics"],
                }),
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: Descriptor.Complete,
                    attributes: ["partsList", "serverList"],
                }),
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: BasicInformation.Complete,
                    attributes: ["vendorId", "productId", "productName"],
                }),
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: GeneralCommissioning.Complete,
                    attributes: ["supportsConcurrentConnection"],
                }),
            ),
        );

        if (commissionedFabrics >= supportedFabrics) {
            throw new MaximumCommissionedFabricsReachedError(
                `Commissioned fabrics (${commissionedFabrics}) exceed supported fabrics (${supportedFabrics}). Please remove some fabrics before commissioning.`,
            );
        }

        this.collectedCommissioningData.rootPartsList = rootPartsList;
        this.collectedCommissioningData.rootServerList = rootServerList;

        this.collectedCommissioningData.vendorId = vendorId;
        this.collectedCommissioningData.productId = productId;
        this.collectedCommissioningData.productName = productName;
        this.collectedCommissioningData.supportsConcurrentConnection = supportsConcurrentConnection;

        const networkData = this.interaction.read(
            Read(
                Read.Attribute({
                    cluster: NetworkCommissioning.Complete,
                    attributes: ["featureMap", "networks"],
                }),
            ),
        );
        const networkFeatures = new Array<{
            endpointId: number;
            value: TypeFromPartialBitSchema<typeof NetworkCommissioning.Complete.features>;
        }>();
        const networkStatus = new Array<{
            endpointId: number;
            value: TypeFromSchema<typeof NetworkCommissioning.TlvNetworkInfo>[];
        }>();

        for await (const data of networkData) {
            for (const entry of data) {
                if (entry.kind !== "attr-value") {
                    continue;
                }
                const {
                    path: { endpointId, attributeId },
                    value,
                } = entry;
                if (attributeId === NetworkCommissioning.Complete.attributes.featureMap.id) {
                    networkFeatures.push({
                        endpointId,
                        value: value as TypeFromPartialBitSchema<typeof NetworkCommissioning.Complete.features>,
                    });
                } else if (attributeId === NetworkCommissioning.Complete.attributes.networks.id) {
                    networkStatus.push({
                        endpointId,
                        value: value as TypeFromSchema<typeof NetworkCommissioning.TlvNetworkInfo>[],
                    });
                }
            }
        }

        this.collectedCommissioningData.networkFeatures = networkFeatures;
        this.collectedCommissioningData.networkStatus = networkStatus;

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 7
     * Commissioner SHALL re-arm the Fail-safe timer on the Commissionee to the desired commissioning
     * timeout within 60 seconds of the completion of PASE session establishment, using the
     * ArmFailSafe command (see Section 11.10.6.2, “ArmFailSafe Command”). A Commissioner MAY
     * obtain device information including guidance on the fail-safe value from the Commissionee by
     * reading BasicCommissioningInfo attribute (see Section 11.10.5.2, “BasicCommissioningInfo
     * Attribute”) prior to invoking the ArmFailSafe command.
     */
    async #armFailsafe(time?: Duration) {
        if (this.collectedCommissioningData.basicCommissioningInfo === undefined) {
            const [basicCommissioningInfo] = await this.#readConcreteAttributeValues(
                Read(
                    Read.Attribute({
                        endpoint: RootEndpointNumber,
                        cluster: GeneralCommissioning.Complete,
                        attributes: ["basicCommissioningInfo"],
                    }),
                ),
            );

            this.collectedCommissioningData.basicCommissioningInfo = basicCommissioningInfo;
            this.#defaultFailSafeTime = Seconds(basicCommissioningInfo.failSafeExpiryLengthSeconds);
            this.#commissioningStartedTime = Time.nowMs;
            this.#commissioningExpiryTime = Timestamp(
                this.#commissioningStartedTime + Seconds(basicCommissioningInfo.maxCumulativeFailsafeSeconds),
            );
        }
        const expiryLength = time ?? this.#defaultFailSafeTime;
        this.#ensureGeneralCommissioningSuccess(
            "armFailSafe",
            await this.#invokeCommand({
                endpoint: RootEndpointNumber,
                cluster: GeneralCommissioning.Complete,
                command: "armFailSafe",
                fields: {
                    breadcrumb: this.lastBreadcrumb,
                    expiryLengthSeconds: Seconds.of(expiryLength),
                },
            }),
        );
        this.#currentFailSafeEndTime = Timestamp(Time.nowMs + expiryLength);
        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    get #failSafeTimeLeft() {
        if (this.#currentFailSafeEndTime === undefined) {
            return Instant;
        }
        return Duration.max(Timespan(Time.nowMs, this.#currentFailSafeEndTime).duration, 0);
    }

    async #ensureFailsafeTimerFor(maxProcessingTime: Duration) {
        const minFailsafeTime = this.interaction.maximumPeerResponseTime(maxProcessingTime);

        const timeLeft = this.#failSafeTimeLeft;
        if (timeLeft < minFailsafeTime) {
            logger.debug(`Failsafe timer has only ${timeLeft}s left, re-arming for at least ${minFailsafeTime}`);
            await this.#armFailsafe(Duration.max(minFailsafeTime, this.#defaultFailSafeTime));
        } else {
            logger.debug(`Failsafe timer is already set for at least ${Seconds.of(timeLeft)}s`);
        }
    }

    async #resetFailsafeTimer() {
        if (this.#currentFailSafeEndTime === undefined) return;
        try {
            await this.#invokeCommand({
                endpoint: RootEndpointNumber,
                cluster: GeneralCommissioning.Complete,
                command: "armFailSafe",
                fields: {
                    breadcrumb: this.lastBreadcrumb,
                    expiryLengthSeconds: 0,
                },
            });
            this.#currentFailSafeEndTime = undefined; // No failsafe active anymore
        } catch (error) {
            logger.error(`Error while resetting failsafe timer`, error);
        }
    }

    /**
     * Step 8 - 1
     * Commissioner SHALL configure regulatory information if the Commissionee has at least one instance of
     * the Network Commissioning cluster on any endpoint with either the WI (i.e. Wi-Fi) or TH (i.e. Thread)
     * feature flags set in its FeatureMap, Commissioner SHALL configure regulatory information in the
     * Commissionee using the SetRegulatoryConfig command.
     */
    async #configureRegulatoryInformation() {
        if (this.collectedCommissioningData.networkFeatures === undefined) {
            throw new CommissioningError(
                "Initial information collection failed. No network features collected. This should never happen.",
            );
        }
        // Read the infos for all Network Commissioning clusters
        const hasRadioNetwork = this.collectedCommissioningData.networkFeatures.some(
            ({ value: { wiFiNetworkInterface, threadNetworkInterface } }) =>
                wiFiNetworkInterface || threadNetworkInterface,
        );

        if (hasRadioNetwork) {
            let [locationCapability] = await this.#readConcreteAttributeValues(
                Read(
                    Read.Attribute({
                        endpoint: RootEndpointNumber,
                        cluster: GeneralCommissioning.Complete,
                        attributes: ["locationCapability"],
                    }),
                ),
            );

            if (locationCapability === GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor) {
                locationCapability = this.commissioningOptions.regulatoryLocation;
            } else {
                logger.debug(
                    `Device does not support a configurable regulatory location type. Location is set to "${
                        locationCapability === GeneralCommissioning.RegulatoryLocationType.Indoor ? "Indoor" : "Outdoor"
                    }"`,
                );
            }
            let countryCode = this.commissioningOptions.regulatoryCountryCode;
            const regulatoryResult = await this.#invokeCommand(
                {
                    endpoint: RootEndpointNumber,
                    cluster: GeneralCommissioning.Complete,
                    command: "setRegulatoryConfig",
                    fields: {
                        breadcrumb: this.lastBreadcrumb++,
                        newRegulatoryConfig: locationCapability,
                        countryCode,
                    },
                },
                {
                    useExtendedFailSafeMessageResponseTimeout: true,
                },
            );
            if (
                regulatoryResult.errorCode === GeneralCommissioning.CommissioningError.ValueOutsideRange &&
                countryCode !== "XX"
            ) {
                logger.debug(
                    `Device does not support a configurable country code. Use "XX" instead of "${countryCode}"`,
                );
                countryCode = "XX";
                this.#ensureGeneralCommissioningSuccess(
                    "setRegulatoryConfig",
                    await this.#invokeCommand(
                        {
                            endpoint: RootEndpointNumber,
                            cluster: GeneralCommissioning.Complete,
                            command: "setRegulatoryConfig",
                            fields: {
                                breadcrumb: this.lastBreadcrumb,
                                newRegulatoryConfig: locationCapability,
                                countryCode,
                            },
                        },
                        {
                            useExtendedFailSafeMessageResponseTimeout: true,
                        },
                    ),
                );
            } else {
                this.#ensureGeneralCommissioningSuccess("setRegulatoryConfig", regulatoryResult);
            }
            return {
                code: CommissioningStepResultCode.Success,
                breadcrumb: this.lastBreadcrumb,
            };
        }
        return {
            code: CommissioningStepResultCode.Skipped,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 8 - 2
     * Commissioner SHOULD configure UTC time, timezone, and DST offset, if the Commissionee supports the
     * time synchronization cluster.
     * ▪ The Commissioner SHOULD configure UTC time using the SetUTCTime command.
     * ▪ The Commissioner SHOULD set the time zone using the SetTimeZone command, if the TimeZone Feature is supported.
     * ▪ The Commissioner SHOULD set the DST offsets using the SetDSTOffset command if the TimeZone Feature is supported, and the SetTimeZoneResponse from the Commissionee had the DSTOffsetsRequired field set to True.
     * ▪ The Commissioner SHOULD set a Default NTP server using the SetDefaultNTP command if the NTPClient Feature is supported and the DefaultNTP attribute is null. If the current value is non-null, Commissioners MAY opt to overwrite the current value.
     */
    async #synchronizeTime() {
        if (
            this.collectedCommissioningData.rootServerList !== undefined &&
            this.collectedCommissioningData.rootServerList.find(
                clusterId => clusterId === TimeSynchronizationCluster.id,
            )
        ) {
            logger.debug("TimeSynchronization cluster is supported");
            // TODO: implement
        }
        return {
            code: CommissioningStepResultCode.Skipped,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 10
     * Commissioner SHALL establish the authenticity of the Commissionee as a certified Matter device
     * (see Section 6.2.3, “Device Attestation Procedure”).
     */
    async #deviceAttestation() {
        const { certificate: deviceAttestation } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "certificateChainRequest",
                fields: {
                    certificateType: OperationalCredentials.CertificateChainType.DacCertificate,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        // TODO: extract device public key from deviceAttestation
        const { certificate: productAttestation } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "certificateChainRequest",
                fields: {
                    certificateType: OperationalCredentials.CertificateChainType.PaiCertificate,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        // TODO: validate deviceAttestation and productAttestation
        const { attestationElements, attestationSignature } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "attestationRequest",
                fields: {
                    attestationNonce: this.fabric.crypto.randomBytes(32),
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        // TODO: validate attestationSignature using device public key
        if (
            deviceAttestation.byteLength === 0 ||
            productAttestation.byteLength === 0 ||
            attestationElements.byteLength === 0 ||
            attestationSignature.byteLength === 0
        ) {
            // TODO: validate the data really
            throw new CommissioningError("Device Attestation data missing from device");
        }
        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };

        // TODO consider Distributed Compliance Ledger Info about Commissioning Flow
    }

    /**
     * Step 11-13
     * 11: Following the Device Attestation Procedure yielding a decision to proceed with commissioning, the Commissioner
     *     SHALL request operational CSR from Commissionee using the CSRRequest command (see Section 11.17.6.5,
     *     “CSRRequest Command”). The CSRRequest command will cause the generation of a new operational key pair at the
     *     Commissionee.
     * 12: Commissioner SHALL generate or otherwise obtain an Operational Certificate containing Operational ID after
     *     receiving the CSRResponse command from the Commissionee (see Section 11.17.6.5, “CSRRequest Command”), using
     *     implementation-specific means.
     * 13: Commissioner SHALL install operational credentials (see Figure 40, “Node Operational Credentials
     *     flow”) on the Commissionee using the AddTrustedRootCertificate and AddNOC commands,
     *     and SHALL use the UpdateFabricLabel command to set a string that the user can recognize and
     *     relate to this Commissioner/Administrator.
     *     The AdminVendorId field of the AddNOC command SHALL be set to a value for which the Vendor Schema in
     *     DCL contains the name and other information of the Commissioner’s manufacturer.
     */
    async #certificates() {
        const { nocsrElements, attestationSignature: csrSignature } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "csrRequest",
                fields: { csrNonce: this.fabric.crypto.randomBytes(32) },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        if (nocsrElements.byteLength === 0 || csrSignature.byteLength === 0) {
            // TODO: validate the data really
            throw new UnexpectedDataError("Invalid response from device");
        }
        // TODO: validate csrSignature using device public key
        const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
        const operationalPublicKey = await Certificate.getPublicKeyFromCsr(this.ca.crypto, certSigningRequest);

        await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "addTrustedRootCertificate",
                fields: {
                    rootCaCertificate: this.ca.rootCert,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        const peerOperationalCert = await this.ca.generateNoc(
            operationalPublicKey,
            this.fabric.fabricId,
            this.interaction.address.nodeId,
        );

        const addNocResponse = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "addNoc",
                fields: {
                    nocValue: peerOperationalCert,
                    icacValue: this.ca.icacCert ?? new Uint8Array(0),
                    ipkValue: this.fabric.identityProtectionKey,
                    adminVendorId: this.fabric.rootVendorId,
                    caseAdminSubject: this.fabric.rootNodeId,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        this.#ensureOperationalCredentialsSuccess("addNoc", addNocResponse);

        const { fabricIndex } = addNocResponse;
        this.collectedCommissioningData.fabricIndex = fabricIndex;

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 13-2 (we do as 99 at the end because)
     * The Administrator having established a CASE session with the Commissionee over the operational network in the
     * previous steps SHALL invoke the CommissioningComplete command (see Section 11.9.6.6,
     * “CommissioningComplete Command”). A success response after invocation of the CommissioningComplete command ends
     * the commissioning process.
     */
    async #updateFabricLabel() {
        const { fabricIndex } = this.collectedCommissioningData;
        if (fabricIndex === undefined) {
            logger.error("No fabric index available after addNoc. This should never happen.");
            return {
                code: CommissioningStepResultCode.Failure,
                breadcrumb: this.lastBreadcrumb,
            };
        }
        try {
            this.#ensureOperationalCredentialsSuccess(
                "updateFabricLabel",
                await this.#invokeCommand({
                    endpoint: RootEndpointNumber,
                    cluster: OperationalCredentials.Complete,
                    command: "updateFabricLabel",
                    fields: {
                        label: this.fabric.label,
                        fabricIndex,
                    },
                }),
            );
        } catch (error) {
            // convert error
            throw repackErrorAs(error, RecoverableCommissioningError);
        }

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 15
     * Commissioner MAY configure the Access Control List (see Access Control Cluster) on the Commissionee in any way
     * it sees fit, if the singular entry added by the AddNOC command in the previous step granting Administer
     * privilege over CASE authentication type for the Node ID provided with the command is not sufficient to express
     * its desired access control policies.
     */
    async #configureAccessControlLists() {
        // Standard entry is enough in our case

        return {
            code: CommissioningStepResultCode.Skipped,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 16-17
     * 16: If the Commissionee both supports it and requires it, the Commissioner SHALL configure the operational network
     *     at the Commissionee using commands such as AddOrUpdateWiFiNetwork (see Section 11.8.7.3, “AddOrUpdateWiFiNetwork
     *     Command”) and AddOrUpdateThreadNetwork (see Section 11.8.7.4, “AddOrUpdateThreadNetwork Command”).
     *     A Commissionee requires network commissioning if it is not already on the desired operational network.
     *     A Commissionee supports network commissioning if it has any NetworkCommissioning cluster instances.
     *     A Commissioner MAY learn about the networks visible to the Commissionee using ScanNetworks command
     *     (see Section 11.8.7.1, “ScanNetworks Command”).
     * 17: The Commissioner SHALL trigger the Commissionee to connect to the operational network using ConnectNetwork
     *     command (see Section 11.8.7.9, “ConnectNetwork Command”) unless the Commissionee is already on the desired
     *     operational network.
     */
    async #validateNetwork() {
        if (
            this.collectedCommissioningData.networkFeatures === undefined ||
            this.collectedCommissioningData.networkStatus === undefined
        ) {
            throw new CommissioningError(
                "Initial information collection failed. No network features or status collected. This should never happen.",
            );
        }
        if (
            (this.commissioningOptions.wifiNetwork === undefined ||
                !this.commissioningOptions.wifiNetwork.wifiSsid ||
                !this.commissioningOptions.wifiNetwork.wifiCredentials) &&
            (this.commissioningOptions.threadNetwork === undefined ||
                !this.commissioningOptions.threadNetwork.networkName ||
                !this.commissioningOptions.threadNetwork.operationalDataset)
        ) {
            // Check if we have no networkCommissioning cluster or an Ethernet one
            const anyEthernetInterface =
                this.collectedCommissioningData.networkFeatures.length === 0 ||
                this.collectedCommissioningData.networkFeatures.some(
                    ({ value: { ethernetNetworkInterface } }) => ethernetNetworkInterface === true,
                );
            const anyInterfaceConnected =
                this.collectedCommissioningData.networkStatus.length === 0 ||
                this.collectedCommissioningData.networkStatus.some(({ value }) =>
                    value.some(({ connected }) => connected),
                );
            if (!anyEthernetInterface && !anyInterfaceConnected) {
                throw new WifiOrThreadNetworkCredentialsNotConfiguredError(
                    "No Wi-Fi/Thread network credentials are configured for commissioning and no Ethernet interface is available on the device and no interface already connected.",
                );
            }
        }

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    async #configureNetworkWifi() {
        if (this.commissioningOptions.wifiNetwork === undefined) {
            logger.debug("WiFi network is not configured");
            return {
                code: CommissioningStepResultCode.Skipped,
                breadcrumb: this.lastBreadcrumb,
            };
        }
        if (
            this.collectedCommissioningData.networkFeatures !== undefined &&
            this.collectedCommissioningData.networkStatus !== undefined
        ) {
            const rootNetworkFeatures = this.collectedCommissioningData.networkFeatures.find(
                ({ endpointId }) => endpointId === 0,
            )?.value;
            const rootNetworkStatus = this.collectedCommissioningData.networkStatus.find(
                ({ endpointId }) => endpointId === 0,
            )?.value;

            logger.debug(
                `Root Networks found: ${Diagnostic.json(rootNetworkFeatures)} - ${Diagnostic.json(rootNetworkStatus)}`,
            );

            if (rootNetworkFeatures?.wiFiNetworkInterface !== true) {
                logger.debug("Commissionee does not support any WiFi network interface");
                return {
                    code: CommissioningStepResultCode.Skipped,
                    breadcrumb: this.lastBreadcrumb,
                };
            }
            if (rootNetworkStatus !== undefined && rootNetworkStatus.length > 0 && rootNetworkStatus[0].connected) {
                logger.debug("Commissionee is already connected to the WiFi network");
                this.collectedCommissioningData.successfullyConnectedToNetwork = true;
                return {
                    code: CommissioningStepResultCode.Skipped,
                    breadcrumb: this.lastBreadcrumb,
                };
            }
        }

        logger.debug("Configuring WiFi network ...");
        const ssid = Bytes.fromString(this.commissioningOptions.wifiNetwork.wifiSsid);
        const credentials = Bytes.fromString(this.commissioningOptions.wifiNetwork.wifiCredentials);

        const [scanMaxTimeSeconds, connectMaxTimeSeconds] = await this.#readConcreteAttributeValues(
            Read(
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    attributes: ["scanMaxTimeSeconds", "connectMaxTimeSeconds"],
                }),
            ),
        );

        // Only Scan when the device supports concurrent connections
        if (this.collectedCommissioningData.supportsConcurrentConnection !== false) {
            // TODO add message transmission time
            await this.#ensureFailsafeTimerFor(Seconds(scanMaxTimeSeconds));

            const { networkingStatus, wiFiScanResults, debugText } = await this.#invokeCommand(
                {
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    command: "scanNetworks",
                    fields: {
                        ssid,
                        breadcrumb: this.lastBreadcrumb++,
                    },
                },
                {
                    expectedProcessingTime: Seconds(scanMaxTimeSeconds),
                },
            );

            if (networkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
                throw new WifiNetworkSetupFailedError(`Commissionee failed to scan for WiFi networks: ${debugText}`);
            }
            if (wiFiScanResults === undefined || wiFiScanResults.length === 0) {
                throw new WifiNetworkSetupFailedError(
                    `Commissionee did not return any WiFi networks for the requested SSID ${this.commissioningOptions.wifiNetwork.wifiSsid}`,
                );
            }
        }

        const {
            networkingStatus: addNetworkingStatus,
            debugText: addDebugText,
            networkIndex,
        } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: NetworkCommissioning.Complete,
                command: "addOrUpdateWiFiNetwork",
                fields: {
                    ssid,
                    credentials,
                    breadcrumb: this.lastBreadcrumb++,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        if (addNetworkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
            throw new WifiNetworkSetupFailedError(`Commissionee failed to add WiFi network: ${addDebugText}`);
        }
        if (networkIndex === undefined) {
            throw new WifiNetworkSetupFailedError(`Commissionee did not return network index`);
        }
        logger.debug(
            `Commissionee added WiFi network ${this.commissioningOptions.wifiNetwork.wifiSsid} with network index ${networkIndex}`,
        );

        const [updatedNetworks] = await this.#readConcreteAttributeValues(
            Read(
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    attributes: ["networks"],
                }),
            ),
        );
        if (updatedNetworks[networkIndex] === undefined) {
            throw new WifiNetworkSetupFailedError(`Commissionee did not return network with index ${networkIndex}`);
        }
        const { networkId, connected } = updatedNetworks[networkIndex];
        if (connected) {
            this.collectedCommissioningData.successfullyConnectedToNetwork = true;
            logger.debug(
                `Commissionee is already connected to WiFi network ${
                    this.commissioningOptions.wifiNetwork.wifiSsid
                } (networkId ${Bytes.toHex(networkId)})`,
            );
            return {
                code: CommissioningStepResultCode.Success,
                breadcrumb: this.lastBreadcrumb,
            };
        }

        // TODO Add retransmission time
        await this.#ensureFailsafeTimerFor(Seconds(connectMaxTimeSeconds));

        const connectResult = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: NetworkCommissioning.Complete,
                command: "connectNetwork",
                fields: {
                    networkId: networkId,
                    breadcrumb: this.lastBreadcrumb++,
                },
            },
            {
                expectedProcessingTime: Seconds(connectMaxTimeSeconds),
            },
        );

        if (connectResult.networkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
            throw new WifiNetworkSetupFailedError(
                `Commissionee failed to connect to WiFi network: ${connectResult.debugText}`,
            );
        }
        this.collectedCommissioningData.successfullyConnectedToNetwork = true;
        logger.debug(
            `Commissionee successfully connected to WiFi network ${
                this.commissioningOptions.wifiNetwork.wifiSsid
            } (networkId ${Bytes.toHex(networkId)})`,
        );

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    async #configureNetworkThread() {
        if (this.collectedCommissioningData.successfullyConnectedToNetwork) {
            logger.info("Node is already connected to a network. Skipping Thread configuration.");
            return {
                code: CommissioningStepResultCode.Skipped,
                breadcrumb: this.lastBreadcrumb,
            };
        }
        if (this.commissioningOptions.threadNetwork === undefined) {
            logger.debug("Thread network is not configured");
            return {
                code: CommissioningStepResultCode.Skipped,
                breadcrumb: this.lastBreadcrumb,
            };
        }
        if (
            this.collectedCommissioningData.networkFeatures !== undefined &&
            this.collectedCommissioningData.networkStatus !== undefined
        ) {
            const rootNetworkFeatures = this.collectedCommissioningData.networkFeatures.find(
                ({ endpointId }) => endpointId === 0,
            )?.value;
            const rootNetworkStatus = this.collectedCommissioningData.networkStatus.find(
                ({ endpointId }) => endpointId === 0,
            )?.value;

            logger.debug(
                `Root Networks found: ${Diagnostic.json(rootNetworkFeatures)} - ${Diagnostic.json(rootNetworkStatus)}`,
            );

            if (rootNetworkFeatures?.threadNetworkInterface !== true) {
                logger.debug("Commissionee does not support any Thread network interface");
                return {
                    code: CommissioningStepResultCode.Skipped,
                    breadcrumb: this.lastBreadcrumb,
                };
            }
            if (rootNetworkStatus !== undefined && rootNetworkStatus.length > 0 && rootNetworkStatus[0].connected) {
                logger.debug("Commissionee is already connected to the Thread network");
                return {
                    code: CommissioningStepResultCode.Skipped,
                    breadcrumb: this.lastBreadcrumb,
                };
            }
        }

        logger.debug("Configuring Thread network ...");
        const [scanMaxTimeSeconds, connectMaxTimeSeconds] = await this.#readConcreteAttributeValues(
            Read(
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    attributes: ["scanMaxTimeSeconds", "connectMaxTimeSeconds"],
                }),
            ),
        );

        if (!this.commissioningOptions.threadNetwork?.networkName) {
            logger.info("Thread network name is not configured. Skip scanning for it.");
        } else if (this.collectedCommissioningData.supportsConcurrentConnection !== false) {
            // Only Scan when the device supports concurrent connections
            await this.#ensureFailsafeTimerFor(Seconds(scanMaxTimeSeconds));

            const { networkingStatus, threadScanResults, debugText } = (await this.#invokeCommand(
                {
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    command: "scanNetworks",
                    fields: { breadcrumb: this.lastBreadcrumb++ },
                },
                {
                    expectedProcessingTime: Seconds(scanMaxTimeSeconds),
                },
            )) as NetworkCommissioning.ScanNetworksResponse;

            if (networkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
                throw new ThreadNetworkSetupFailedError(
                    `Commissionee failed to scan for Thread networks: ${debugText}`,
                );
            }
            if (threadScanResults === undefined || threadScanResults.length === 0) {
                throw new ThreadNetworkSetupFailedError(
                    `Commissionee did not return any Thread networks for the requested Network ${this.commissioningOptions.threadNetwork.networkName}`,
                );
            }
            const wantedNetworkFound = threadScanResults.find(
                ({ networkName }) => networkName === this.commissioningOptions.threadNetwork?.networkName,
            );
            if (wantedNetworkFound === undefined) {
                throw new ThreadNetworkSetupFailedError(
                    `Commissionee did not return the requested Network ${
                        this.commissioningOptions.threadNetwork.networkName
                    }: ${Diagnostic.json(threadScanResults)}`,
                );
            }
            logger.debug(
                `Commissionee found wanted Thread network ${
                    this.commissioningOptions.threadNetwork.networkName
                }: ${Diagnostic.json(wantedNetworkFound)}`,
            );
        }

        const {
            networkingStatus: addNetworkingStatus,
            debugText: addDebugText,
            networkIndex,
        } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: NetworkCommissioning.Complete,
                command: "addOrUpdateThreadNetwork",
                fields: {
                    operationalDataset: Bytes.fromHex(this.commissioningOptions.threadNetwork.operationalDataset),
                    breadcrumb: this.lastBreadcrumb++,
                },
            },
            {
                useExtendedFailSafeMessageResponseTimeout: true,
            },
        );

        if (addNetworkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
            throw new ThreadNetworkSetupFailedError(`Commissionee failed to add Thread network: ${addDebugText}`);
        }
        if (networkIndex === undefined) {
            throw new ThreadNetworkSetupFailedError(`Commissionee did not return network index`);
        }
        logger.debug(
            `Commissionee added Thread network ${this.commissioningOptions.threadNetwork.networkName} with network index ${networkIndex}`,
        );

        const updatedNetworks = await this.#readConcreteAttributeValues(
            Read(
                Read.Attribute({
                    endpoint: RootEndpointNumber,
                    cluster: NetworkCommissioning.Complete,
                    attributes: ["networks"],
                }),
            ),
        );

        if (updatedNetworks[networkIndex] === undefined) {
            throw new ThreadNetworkSetupFailedError(`Commissionee did not return network with index ${networkIndex}`);
        }
        const { networkId, connected } = updatedNetworks[networkIndex];
        if (connected) {
            logger.debug(
                `Commissionee is already connected to Thread network ${
                    this.commissioningOptions.threadNetwork.networkName
                } (networkId ${Bytes.toHex(networkId)})`,
            );
            return {
                code: CommissioningStepResultCode.Success,
                breadcrumb: this.lastBreadcrumb,
            };
        }

        await this.#ensureFailsafeTimerFor(Seconds(connectMaxTimeSeconds));

        const connectResult = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: NetworkCommissioning.Complete,
                command: "connectNetwork",
                fields: {
                    networkId: networkId,
                    breadcrumb: this.lastBreadcrumb++,
                },
            },
            {
                expectedProcessingTime: Seconds(connectMaxTimeSeconds),
            },
        );

        if (connectResult.networkingStatus !== NetworkCommissioning.NetworkCommissioningStatus.Success) {
            throw new ThreadNetworkSetupFailedError(
                `Commissionee failed to connect to Thread network: ${connectResult.debugText}`,
            );
        }
        logger.debug(
            `Commissionee successfully connected to Thread network ${
                this.commissioningOptions.threadNetwork.networkName
            } (networkId ${Bytes.toHex(networkId)})`,
        );

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 18-19
     * 18: Finalization of the Commissioning process begins. An Administrator configured in the ACL of the Commissionee
     *     by the Commissioner SHALL use Operational Discovery to discover the Commissionee. This Administrator MAY be
     *     the Commissioner itself, or another Node to which the Commissioner has delegated the task.
     * 19: The Administrator SHALL open a CASE (see Section 4.13.2, “Certificate Authenticated Session Establishment
     *     (CASE)”) session with the Commissionee over the operational network.
     */
    async #reconnectWithDevice() {
        const isConcurrentFlow = this.collectedCommissioningData.supportsConcurrentConnection !== false;

        logger.debug(`Reconnecting with device with ${isConcurrentFlow ? "concurrent" : "non-concurrent"} flow ...`);

        // Reconnection with discovery could take longer then the default failsafe time, so we need to
        // re-arm the failsafe when we are in a concurrent commissioning flow also in parallel to
        // the operative reconnection
        // TODO: Check whats needed for non-concurrent commissioning flows (maybe arm initially longer?)
        const reArmFailsafeInterval = Time.getPeriodicTimer(
            "Re-Arm Failsafe during reconnect",
            Millis(this.#defaultFailSafeTime / 2),
            () => {
                const now = Time.nowMs;
                if (this.#commissioningExpiryTime !== undefined && now < this.#commissioningExpiryTime) {
                    logger.error(
                        `Re-Arm Failsafe Timer during reconnect with device. Time left: ${Math.round((this.#commissioningExpiryTime - now) / 1000)}s`,
                    );
                    this.#armFailsafe().catch(error => {
                        logger.error("Error while re-arming failsafe during reconnect", error);
                        reArmFailsafeInterval.stop();
                    });
                } else {
                    // Stop as soon as we are over the maximum commissioning time
                    reArmFailsafeInterval.stop();
                }
            },
        );
        if (isConcurrentFlow) {
            reArmFailsafeInterval.start();
        }

        let transitionResult: ClientInteraction | undefined;
        try {
            transitionResult = await this.transitionToCase(
                this.interaction.address,
                // Assume concurrent connections are supported if not know (which should not be the case when we came here)
                isConcurrentFlow,
            );
        } catch (cause) {
            throw new OperativeConnectionFailedError("Operative reconnection with device failed", { cause });
        }

        reArmFailsafeInterval.stop();

        if (transitionResult === undefined) {
            logger.debug("CASE commissioning handled externally, terminating commissioning flow");
            return {
                code: CommissioningStepResultCode.Stop,
                breadcrumb: this.lastBreadcrumb,
            };
        }

        this.interaction = transitionResult;
        this.#clusterClients.clear();

        logger.debug("Successfully reconnected with device ...");

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }

    /**
     * Step 20
     * The Administrator having established a CASE session with the Commissionee over the operational network in the
     * previous steps SHALL invoke the CommissioningComplete command (see Section 11.9.6.6,
     * “CommissioningComplete Command”). A success response after invocation of the CommissioningComplete command ends
     * the commissioning process.
     */
    async #completeCommissioning() {
        this.#ensureGeneralCommissioningSuccess(
            "commissioningComplete",
            await this.#invokeCommand(
                {
                    endpoint: RootEndpointNumber,
                    cluster: GeneralCommissioning.Complete,
                    command: "commissioningComplete",
                },
                {
                    useExtendedFailSafeMessageResponseTimeout: true,
                },
            ),
        );
        this.#currentFailSafeEndTime = undefined; // gets deactivated when successful

        return {
            code: CommissioningStepResultCode.Success,
            breadcrumb: this.lastBreadcrumb,
        };
    }
}
