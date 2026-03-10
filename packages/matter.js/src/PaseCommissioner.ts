/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChannelType, Environment, ImplementationError, Logger, Minutes, SharedEnvironmentServices } from "@matter/general";
import {
    CertificateAuthority,
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    DiscoveryData,
    Fabric,
    MdnsService,
} from "@matter/protocol";
import { ContinuousDiscovery, RemoteDescriptor, ServerNode } from "@matter/node";
import { DiscoveryCapabilitiesBitmap, NodeId, TypeFromPartialBitSchema } from "@matter/types";
import {
    CommissioningControllerOptions,
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
    readonly #environment: Environment;
    #controllerInstance?: MatterController;
    #services?: SharedEnvironmentServices;
    // Keyed by JSON-stringified identifier so cancelCommissionableDeviceDiscovery() can look up active discoveries.
    readonly #activeDiscoveries = new Map<string, ContinuousDiscovery>();

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
        this.#environment = environment;
    }

    get nodeId() {
        return this.#controllerInstance?.nodeId;
    }

    assertControllerIsStarted(errorText?: string) {
        if (this.#controllerInstance === undefined) {
            throw new ImplementationError(
                errorText ?? "Controller instance not yet started. Please call start() first.",
            );
        }
        return this.#controllerInstance;
    }

    /** Internal method to initialize a MatterController instance. */
    private async initializeController() {
        if (this.#controllerInstance !== undefined) {
            return this.#controllerInstance;
        }

        const { certificateAuthorityConfig: rootCertificateData, fabricConfig } = this.options;

        this.#services = this.#environment.asDependent();
        try {
            await this.#services.load(MdnsService);
        } catch {
            logger.debug("No networking available, using only BLE");
        }

        return await MatterController.createAsPaseCommissioner({
            id: "PaseCommissioner", // In Memory anyway
            environment: this.#environment,
            certificateAuthorityConfig: rootCertificateData,
            fabricConfig: fabricConfig,
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
        await this.#controllerInstance?.close();
        this.#controllerInstance = undefined;
        await this.#services?.close();
    }

    /** Initialize the controller. */
    async start() {
        const runtime = this.#environment.runtime;
        runtime.add(this);
        if (this.#controllerInstance === undefined) {
            this.#controllerInstance = await this.initializeController();
        }
    }

    cancelCommissionableDeviceDiscovery(
        identifierData: CommissionableDeviceIdentifiers,
        _discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
    ) {
        const key = JSON.stringify(identifierData);
        this.#activeDiscoveries.get(key)?.stop();
    }

    async discoverCommissionableDevices(
        identifierData: CommissionableDeviceIdentifiers,
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
        discoveredCallback?: (device: CommissionableDevice) => void,
        timeout = Minutes(15),
    ) {
        const key = JSON.stringify(identifierData);
        const discovery = new ContinuousDiscovery(this.assertControllerIsStarted().node as ServerNode, {
            ...identifierData,
            timeout,
            scannerFilter: discoveryCapabilities
                ? (s): boolean =>
                      s.type === ChannelType.UDP || (!!discoveryCapabilities.ble && s.type === ChannelType.BLE)
                : undefined,
        });
        const results = Array<CommissionableDevice>();
        const seen = new Set<string>();
        discovery.discovered.on(node => {
            const device = RemoteDescriptor.fromLongForm(node.state.commissioning) as CommissionableDevice;
            const id = device.deviceIdentifier ?? JSON.stringify(node.state.commissioning.addresses ?? []);
            if (!seen.has(id)) {
                seen.add(id);
                results.push(device);
                discoveredCallback?.(device);
            }
        });
        this.#activeDiscoveries.set(key, discovery);
        try {
            await discovery;
            return results;
        } finally {
            this.#activeDiscoveries.delete(key);
        }
    }
}
