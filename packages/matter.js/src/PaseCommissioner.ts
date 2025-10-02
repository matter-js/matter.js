/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Environment, ImplementationError, Logger, Minutes, Network } from "#general";
import {
    CertificateAuthority,
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    ControllerDiscovery,
    DiscoveryData,
    Fabric,
    MdnsClient,
    MdnsService,
    Scanner,
} from "#protocol";
import { DiscoveryCapabilitiesBitmap, NodeId, TypeFromPartialBitSchema } from "#types";
import {
    CommissioningControllerOptions,
    configureNetwork as configureControllerNetwork,
    ControllerEnvironmentOptions,
    NodeCommissioningOptions,
} from "./CommissioningController.js";
import { MatterController } from "./MatterController.js";

const logger = new Logger("PaseCommissioner");

type PaseCommissionerOptions = Omit<CommissioningControllerOptions, "environment"> & {
    /** The environment for the controller. */
    environment: ControllerEnvironmentOptions;

    /** The root certificate data for the controller. */
    certificateAuthorityConfig: CertificateAuthority.Configuration;

    /** The fabric config of the controller. */
    fabricConfig: Fabric.Config;
};

/**
 * This represents a lightweight commissioner that can be used to start the commissioning process to commission
 * devices into an existing controller fabric. Once the initial commissioning process is completed, it uses a callback
 * to all to complete the commissioning process.
 */
export class PaseCommissioner {
    private readonly environment: Environment;
    private controllerInstance?: MatterController;

    /**
     * Creates a new CommissioningController instance
     *
     * @param options The options for the CommissioningController
     */
    constructor(private readonly options: PaseCommissionerOptions) {
        if (options.environment === undefined) {
            throw new ImplementationError("You need to prove an environment for the commissioner.");
        }
        const { environment } = options.environment;
        this.environment = environment;
    }

    get nodeId() {
        return this.controllerInstance?.nodeId;
    }

    assertControllerIsStarted(errorText?: string) {
        if (this.controllerInstance === undefined) {
            throw new ImplementationError(
                errorText ?? "Controller instance not yet started. Please call start() first.",
            );
        }
        return this.controllerInstance;
    }

    /** Internal method to initialize a MatterController instance. */
    private async initializeController() {
        if (this.controllerInstance !== undefined) {
            return this.controllerInstance;
        }

        const { certificateAuthorityConfig: rootCertificateData, fabricConfig: fabricConfig } = this.options;

        let mdnsClient: MdnsClient | undefined;
        let ipv4Disabled = false;

        try {
            const mdnsService = await this.environment.load(MdnsService);
            ipv4Disabled = !mdnsService.enableIpv4;
            mdnsClient = mdnsService.client;
        } catch {
            logger.debug("No networking available, using only BLE");
        }

        const { scanners, netInterfaces } = await configureControllerNetwork({
            network: this.environment.get(Network),
            mdnsClient,
            ipv4Disabled,
            ...this.options,
        });

        return await MatterController.createAsPaseCommissioner({
            certificateAuthorityConfig: rootCertificateData,
            fabricConfig: fabricConfig,
            scanners,
            transports: netInterfaces,
            adminFabricLabel: this.options.fabricConfig.label,
        });
    }

    /**
     * Commissions/Pairs a new device into the controller fabric. The method returns the NodeId of the commissioned node.
     *
     * Use the connectNodeAfterCommissioning callback to implement an own logic to do the operative device discovery and
     * to complete the commissioning process.
     * Return true when the commissioning process is completed successfully, false on error.
     */
    async commissionNode(
        nodeOptions: NodeCommissioningOptions,
        completeCommissioningCallback: (peerNodeId: NodeId, discoveryData?: DiscoveryData) => Promise<boolean>,
    ) {
        const controller = this.assertControllerIsStarted();

        return await controller.commission(nodeOptions, { completeCommissioningCallback });
    }

    /** Disconnects all connected nodes and Closes the network connections and other resources of the controller. */
    async close() {
        await this.controllerInstance?.close();
        this.controllerInstance = undefined;
    }

    /** Initialize the controller. */
    async start() {
        const runtime = this.environment.runtime;
        runtime.add(this);
        if (this.controllerInstance === undefined) {
            this.controllerInstance = await this.initializeController();
        }
    }

    cancelCommissionableDeviceDiscovery(
        identifierData: CommissionableDeviceIdentifiers,
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
    ) {
        const controller = this.assertControllerIsStarted();
        controller
            .collectScanners(discoveryCapabilities)
            .forEach((scanner: Scanner) =>
                ControllerDiscovery.cancelCommissionableDeviceDiscovery(scanner, identifierData),
            );
    }

    async discoverCommissionableDevices(
        identifierData: CommissionableDeviceIdentifiers,
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
        discoveredCallback?: (device: CommissionableDevice) => void,
        timeout = Minutes(15),
    ) {
        const controller = this.assertControllerIsStarted();
        return await ControllerDiscovery.discoverCommissionableDevices(
            controller.collectScanners(discoveryCapabilities),
            timeout,
            identifierData,
            discoveredCallback,
        );
    }
}
