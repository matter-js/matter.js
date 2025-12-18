/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConnectionlessTransport,
    ConnectionlessTransportSet,
    Crypto,
    InterfaceType,
    Logger,
    Network,
    NetworkInterface,
    NetworkInterfaceDetailed,
    NoAddressAvailableError,
    ObserverGroup,
    SharedEnvironmentServices,
    UdpInterface,
} from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import { InteractionServer } from "#node/server/InteractionServer.js";
import {
    Advertiser,
    Ble,
    BleAdvertiser,
    DeviceAdvertiser,
    DeviceCommissioner,
    ExchangeManager,
    MdnsAdvertiser,
    MdnsService,
    PeerSet,
    ScannerSet,
    SecureChannelProtocol,
    SessionManager,
} from "#protocol";
import { CommissioningServer } from "../commissioning/CommissioningServer.js";
import { ProductDescriptionServer } from "../product-description/ProductDescriptionServer.js";
import { SessionsBehavior } from "../sessions/SessionsBehavior.js";
import { NetworkRuntime } from "./NetworkRuntime.js";
import { ServerGroupNetworking } from "./ServerGroupNetworking.js";

const logger = Logger.get("ServerNetworkRuntime");

function convertNetworkEnvironmentType(type: string | number) {
    const convertedType: InterfaceType =
        typeof type === "string" ? InterfaceType[type as keyof typeof InterfaceType] : type;
    if (typeof convertedType !== "number" || convertedType < 1 || convertedType > 4) {
        return undefined;
    }
    return convertedType;
}

/**
 * Handles network functionality for {@link NodeServer}.
 */
export class ServerNetworkRuntime extends NetworkRuntime {
    #mdnsAdvertiser?: MdnsAdvertiser;
    #bleAdvertiser?: BleAdvertiser;
    #bleTransport?: ConnectionlessTransport;
    #ipv6UdpInterface?: UdpInterface;
    #observers = new ObserverGroup(this);
    #groupNetworking?: ServerGroupNetworking;
    #services: SharedEnvironmentServices;

    constructor(owner: ServerNode) {
        super(owner);
        this.#services = owner.env.asDependent();
    }

    override get owner() {
        return super.owner as ServerNode;
    }

    /**
     * Access the MDNS advertiser for the node.
     */
    get mdnsAdvertiser() {
        if (!this.#mdnsAdvertiser) {
            const port = this.owner.state.network.operationalPort;
            const options = {
                lifetime: this.construction,
                ...this.owner.state.commissioning.mdns,
            };
            const crypto = this.owner.env.get(Crypto);
            const { server } = this.#services.get(MdnsService);
            this.#mdnsAdvertiser = new MdnsAdvertiser(crypto, server, { ...options, port });
        }
        return this.#mdnsAdvertiser;
    }

    get networkInterfaceConfiguration(): NetworkInterface[] {
        const interfaceConfig = this.owner.env.vars.get<Record<string, { type: string | number }>>(
            "network.interface",
            {},
        );

        return Object.entries(interfaceConfig).map(([name, { type }]) => ({
            name,
            type: convertNetworkEnvironmentType(type),
        }));
    }

    async getNetworkInterfaces(): Promise<NetworkInterfaceDetailed[]> {
        const network = this.owner.env.get(Network);

        const interfaces = await network.getNetInterfaces(this.networkInterfaceConfiguration);
        const interfaceDetails = new Array<NetworkInterfaceDetailed>();
        for (const { name, type } of interfaces) {
            const details = await network.getIpMac(name);
            if (details !== undefined) {
                interfaceDetails.push({ name, type, ...details });
            }
        }
        return interfaceDetails;
    }

    /**
     * A BLE advertiser.
     */
    protected get bleAdvertiser() {
        if (this.#bleAdvertiser === undefined) {
            const { peripheralInterface } = this.owner.env.get(Ble);
            const options = {
                lifetime: this.construction,
                ...this.owner.state.commissioning.ble,
            };
            this.#bleAdvertiser = new BleAdvertiser(peripheralInterface, options);
        }
        return this.#bleAdvertiser;
    }

    /**
     * A BLE transport.
     */
    protected get bleTransport() {
        if (this.#bleTransport === undefined) {
            this.#bleTransport = this.owner.env.get(Ble).peripheralInterface;
        }
        return this.#bleTransport;
    }

    /**
     * Add transports to the {@link ConnectionlessTransportSet}.
     */
    protected async addTransports(interfaces: ConnectionlessTransportSet) {
        const netconf = this.owner.state.network;

        const port = this.owner.state.network.port;
        try {
            this.#ipv6UdpInterface = await UdpInterface.create(
                this.owner.env.get(Network),
                "udp6",
                port ? port : undefined,
                netconf.listeningAddressIpv6,
            );
            interfaces.add(this.#ipv6UdpInterface);

            await this.owner.set({ network: { operationalPort: this.#ipv6UdpInterface.port } });
        } catch (error) {
            NoAddressAvailableError.accept(error);
            logger.info(`IPv6 UDP interface not created because IPv6 is not available, but required my Matter.`);
            throw error;
        }

        if (netconf.ipv4) {
            try {
                interfaces.add(
                    await UdpInterface.create(
                        this.owner.env.get(Network),
                        "udp4",
                        netconf.port,
                        netconf.listeningAddressIpv4,
                    ),
                );
            } catch (error) {
                NoAddressAvailableError.accept(error);
                logger.info(`IPv4 UDP interface not created because IPv4 is not available`);
            }
        }

        if (netconf.ble) {
            interfaces.add(this.bleTransport);
        }
    }

    /**
     * Add broadcasters to the {@link DeviceAdvertiser}.
     */
    protected async addBroadcasters(advertiser: DeviceAdvertiser) {
        await advertiser.clearAdvertisers();

        const isCommissioned = !!this.#commissionedFabrics;

        let discoveryCapabilities = this.owner.state.network.discoveryCapabilities;

        if (isCommissioned) {
            // Already commissioned, only broadcast on network
            discoveryCapabilities = { onIpNetwork: true };
        }

        if (discoveryCapabilities.onIpNetwork) {
            advertiser.addAdvertiser(this.mdnsAdvertiser);
        }

        if (!isCommissioned && discoveryCapabilities.ble) {
            // BLE announcements are only relevant when not commissioned
            advertiser.addAdvertiser(this.bleAdvertiser);
        }
    }

    /**
     * When the first Fabric gets added we need to enable MDNS broadcasting.
     */
    ensureMdnsAdvertiser() {
        const device = this.owner.env.get(DeviceAdvertiser);
        const mdnsAdvertiser = this.mdnsAdvertiser;
        if (!device.hasAdvertiser(mdnsAdvertiser)) {
            logger.debug("Enabling MDNS advertising");
            device.addAdvertiser(mdnsAdvertiser);
        }
    }

    /**
     * On commission we turn off bluetooth and join the IP network if we haven't already.
     *
     * On decommission we're destroyed so don't need to handle that case.
     */
    endUncommissionedMode() {
        // Ensure MDNS broadcasting are active when the first fabric is added.  It might not be active initially if the
        // node was not on an IP network prior to commissioning
        this.ensureMdnsAdvertiser();

        if (this.#bleAdvertiser) {
            this.owner.env.runtime.add(this.#deleteAdvertiser(this.#bleAdvertiser));
            this.#bleAdvertiser = undefined;
        }

        if (this.#bleTransport) {
            this.owner.env.runtime.add(this.#deleteTransport(this.#bleTransport));
            this.#bleTransport = undefined;
        }
    }

    async #deleteAdvertiser(advertiser: Advertiser) {
        const device = this.owner.env.get(DeviceAdvertiser);
        await device.deleteAdvertiser(advertiser);
    }

    async #deleteTransport(transport: ConnectionlessTransport) {
        const netInterfaces = this.owner.env.get(ConnectionlessTransportSet);
        netInterfaces.delete(transport);
        await transport.close();
    }

    get #commissionedFabrics() {
        return this.owner.state.operationalCredentials.commissionedFabrics;
    }

    protected override async start() {
        const { owner } = this;
        const { env } = owner;

        // Configure network
        const interfaces = env.get(ConnectionlessTransportSet);
        await this.addTransports(interfaces);

        // Initialize MDNS
        const mdns = await this.#services.load(MdnsService);

        const advertiser = env.get(DeviceAdvertiser);

        await this.addBroadcasters(advertiser);

        await owner.act("start-network", agent => agent.load(ProductDescriptionServer));

        // Apply settings to environmental components
        env.get(SessionManager).sessionParameters = {
            maxPathsPerInvoke: this.owner.state.basicInformation.maxPathsPerInvoke,
        };

        await this.#initializeGroupNetworking();

        // Install our interaction server
        const interactionServer = new InteractionServer(this.owner, env.get(SessionManager));
        env.set(InteractionServer, interactionServer);
        env.get(ExchangeManager).addProtocolHandler(interactionServer);

        // Ensure SecureChannelProtocol is installed
        env.get(SecureChannelProtocol);

        await this.owner.act("load-sessions", agent => agent.load(SessionsBehavior));

        // Monitor CommissioningServer to end "uncommissioned" mode when we are commissioned
        this.#observers.on(this.owner.eventsOf(CommissioningServer).commissioned, this.endUncommissionedMode);

        // Enable MDNS broadcasting if there are fabrics present
        if (this.owner.stateOf(CommissioningServer).commissioned) {
            this.ensureMdnsAdvertiser();
        }

        // Initialize ScannerSet
        this.owner.env.get(ScannerSet).add(mdns.client);

        await env.load(PeerSet);

        // Prevent new connections when aborted
        this.abortSignal.addEventListener("abort", () =>
            this.owner.env.maybeGet(InteractionServer)?.blockNewActivity(),
        );

        await this.owner.act(agent => this.owner.lifecycle.online.emit(agent.context));
    }

    protected override async stop() {
        this.#observers.close();

        const { env } = this.owner;

        {
            using _lifetime = this.construction.join("commissioner");
            await env.close(DeviceCommissioner);
        }

        // Shutdown the Broadcaster if DeviceAdvertiser is not initialized
        // We kick-off the Advertiser shutdown to prevent re-announces when removing sessions and wait a bit later
        const advertisementShutdown = this.owner.env.has(DeviceAdvertiser)
            ? this.owner.env.close(DeviceAdvertiser)
            : this.#mdnsAdvertiser?.close();
        this.#mdnsAdvertiser = undefined;

        {
            using _lifetime = this.construction.join("preparing");
            await this.owner.prepareRuntimeShutdown();
        }

        this.#groupNetworking?.close();
        this.#groupNetworking = undefined;

        // Now all sessions are closed, so we wait for Advertiser to be gone
        {
            using _advertiser = this.construction.join("advertisement");
            await advertisementShutdown;
        }

        {
            using _lifetime = this.construction.join("services");
            await this.#services.close();
        }

        {
            using _lifetime = this.construction.join("exchanges");
            await env.close(ExchangeManager);
        }

        {
            using _lifetime = this.construction.join("protocols");
            await env.close(SecureChannelProtocol);
        }

        {
            using _lifetime = this.construction.join("transports");
            await env.close(ConnectionlessTransportSet);
        }

        {
            using _lifetime = this.construction.join("interactions");
            await env.close(InteractionServer);
        }

        {
            using _lifetime = this.construction.join("peers");
            await env.close(PeerSet);
        }

        env.delete(ScannerSet);
    }

    async #initializeGroupNetworking() {
        if (this.#groupNetworking) {
            logger.warn("Group networking already initialized, skipping.");
            return;
        }
        if (this.#ipv6UdpInterface === undefined) {
            logger.warn("No IPv6 UDP interface available, skipping group networking initialization.");
            return;
        }

        this.#groupNetworking = new ServerGroupNetworking(this.owner.env, this.#ipv6UdpInterface);
        await this.#groupNetworking.construction;
    }
}
