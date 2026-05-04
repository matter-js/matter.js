/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkCommissioningBehavior } from "#behaviors/network-commissioning";
import type { ServerNode } from "#node/ServerNode.js";
import { InteractionServer } from "#node/server/InteractionServer.js";
import {
    AddressInUseError,
    Crypto,
    InterfaceType,
    Logger,
    Network,
    NetworkInterface,
    NetworkInterfaceDetailed,
    NoAddressAvailableError,
    ObserverGroup,
    Transport,
    TransportSet,
    UdpTransport,
} from "@matter/general";
import { DeviceClassification } from "@matter/model";
import {
    Advertiser,
    Ble,
    BleAdvertiser,
    ClientSubscriptions,
    DeviceAdvertiser,
    DeviceCommissioner,
    ExchangeManager,
    MdnsAdvertiser,
    MdnsService,
    NetworkProfiles,
    PeerSet,
    ScannerSet,
    SecureChannelProtocol,
    SessionManager,
    TcpTransport,
} from "@matter/protocol";
import { CommissioningServer } from "../commissioning/CommissioningServer.js";
import { ProductDescriptionServer } from "../product-description/ProductDescriptionServer.js";
import { SessionsBehavior } from "../sessions/SessionsBehavior.js";
import { NetworkRuntime } from "./NetworkRuntime.js";
import { NetworkServer } from "./NetworkServer.js";
import { ServerGroupNetworking } from "./ServerGroupNetworking.js";

const logger = Logger.get("ServerNetworkRuntime");

const MAX_PORT_ASSIGNMENT_RETRIES = 10;

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
    #bleTransport?: Transport;
    #ipv6UdpTransport?: UdpTransport;
    #observers = new ObserverGroup(this);
    #groupNetworking?: ServerGroupNetworking;
    #subscriptionsDrained?: Promise<void>;

    constructor(owner: ServerNode) {
        super(owner);
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
            const { server } = this.owner.env.get(MdnsService);
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
     * Add transports to the {@link TransportSet}.
     */
    protected async addTransports(interfaces: TransportSet) {
        const netconf = this.owner.state.network;
        const network = this.owner.env.get(Network);

        const port = this.owner.state.network.port;

        // When port is auto-assigned (0/undefined), we need both IPv6 and IPv4 UDP on the same port.
        // The OS may assign an IPv6 port already taken on IPv4, so we retry up to 10 times.
        const maxPortRetries = port ? 1 : MAX_PORT_ASSIGNMENT_RETRIES;

        for (let attempt = 1; attempt <= maxPortRetries; attempt++) {
            let ipv6Interface: UdpTransport;
            try {
                ipv6Interface = await UdpTransport.create(
                    network,
                    "udp6",
                    port ? port : undefined,
                    netconf.listeningAddressIpv6,
                );
            } catch (error) {
                NoAddressAvailableError.accept(error);
                logger.info(`IPv6 UDP interface not created because IPv6 is not available, but required by Matter.`);
                throw error;
            }

            let ipv4Interface: UdpTransport | undefined;
            if (netconf.ipv4) {
                try {
                    ipv4Interface = await UdpTransport.create(
                        network,
                        "udp4",
                        ipv6Interface.port,
                        netconf.listeningAddressIpv4,
                    );
                } catch (error) {
                    if (error instanceof AddressInUseError && attempt < maxPortRetries) {
                        logger.info(
                            `IPv4 UDP port ${ipv6Interface.port} already in use, retrying with new port (attempt ${attempt}/${maxPortRetries})`,
                        );
                        await ipv6Interface.close();
                        continue;
                    }
                    NoAddressAvailableError.accept(error);
                    logger.info(`IPv4 UDP interface not created because IPv4 is not available`);
                }
            }

            const tcpConfig = NetworkServer.resolveTcpConfig(netconf.tcp);
            let tcpTransport: TcpTransport | undefined;
            if (tcpConfig.incoming || tcpConfig.outgoing) {
                try {
                    tcpTransport = await TcpTransport.create({
                        network,
                        listeningPort: tcpConfig.incoming ? ipv6Interface.port : undefined,
                    });
                } catch (error) {
                    if (error instanceof AddressInUseError && attempt < maxPortRetries) {
                        logger.info(
                            `TCP port ${ipv6Interface.port} already in use, retrying with new port (attempt ${attempt}/${maxPortRetries})`,
                        );
                        await ipv6Interface.close();
                        if (ipv4Interface !== undefined) {
                            await ipv4Interface.close();
                        }
                        continue;
                    }
                    throw error;
                }
            }

            this.#ipv6UdpTransport = ipv6Interface;
            interfaces.add(ipv6Interface);
            if (ipv4Interface !== undefined) {
                interfaces.add(ipv4Interface);
            }
            if (tcpTransport !== undefined) {
                interfaces.add(tcpTransport);
                logger.info(`TCP transport enabled (incoming=${tcpConfig.incoming}, outgoing=${tcpConfig.outgoing})`);
            }
            await this.owner.set({ network: { operationalPort: ipv6Interface.port } });
            break;
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
     * On commission, we turn off bluetooth and join the IP network if we haven't already.
     *
     * On decommission, we're destroyed so don't need to handle that case.
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

    async #deleteTransport(transport: Transport) {
        const netInterfaces = this.owner.env.get(TransportSet);
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
        const interfaces = env.get(TransportSet);
        await this.addTransports(interfaces);

        const advertiser = env.get(DeviceAdvertiser);

        // Set TCP support for operational DNS-SD advertisements
        const tcpConfig = NetworkServer.resolveTcpConfig(owner.state.network.tcp);
        if (tcpConfig.incoming || tcpConfig.outgoing) {
            advertiser.supportedTransports = { tcpClient: tcpConfig.outgoing, tcpServer: tcpConfig.incoming };
        }

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
        const exchanges = env.get(ExchangeManager);
        exchanges.addProtocolHandler(interactionServer);

        // Ensure SecureChannelProtocol is installed
        env.get(SecureChannelProtocol);

        await this.owner.act("load-sessions", agent => agent.load(SessionsBehavior));

        // Monitor CommissioningServer to end "uncommissioned" mode when we are commissioned
        this.#observers.on(this.owner.eventsOf(CommissioningServer).commissioned, this.endUncommissionedMode);

        // Enable MDNS broadcasting if there are fabrics present
        if (this.owner.stateOf(CommissioningServer).commissioned) {
            this.ensureMdnsAdvertiser();
        }

        // Ensure ScannerSet exists; ControllerBehavior adds the actual scanner
        env.get(ScannerSet);

        const { timing, profiles } = this.owner.state.network;
        if (timing) {
            env.get(PeerSet).timing = timing;
        }
        // Auto-detect the "unknown" profile for peers with unknown physical properties.  If the node has
        // application endpoints we derive it from local network capabilities.  Users can still override
        // via profiles.unknown in config.
        const autoUnknown = this.#detectFallbackProfile();
        const effectiveProfiles = autoUnknown !== undefined ? { unknown: autoUnknown, ...profiles } : profiles;
        if (effectiveProfiles) {
            env.get(NetworkProfiles).defaults = effectiveProfiles;
        }

        env.get(PeerSet).exchanges = exchanges;

        // Prevent new activity when aborted — block both server interactions and client subscription data reports
        this.abortSignal.addEventListener(
            "abort",
            () => {
                this.owner.env.maybeGet(InteractionServer)?.blockNewActivity();
                this.#subscriptionsDrained = this.owner.env.maybeGet(ClientSubscriptions)?.blockNewActivity();
            },
            { once: true },
        );

        await this.owner.act(agent => this.owner.lifecycle.online.emit(agent.context));
    }

    protected override async stop() {
        this.#observers.close();

        const { env } = this.owner;

        // Wait for any in-flight subscription data report processing to complete before tearing down resources
        if (this.#subscriptionsDrained) {
            using _lifetime = this.construction.join("subscription reads");
            await this.#subscriptionsDrained;
        }

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
            using _lifetime = this.construction.join("peers");
            await env.maybeGet(PeerSet)?.disconnect();
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

            // Close transports but leave the set in place as it is shared and will be reused
            await env.maybeGet(TransportSet)?.close();
        }

        {
            using _lifetime = this.construction.join("interactions");
            await env.close(InteractionServer);
        }

        env.delete(ScannerSet);
    }

    /**
     * Auto-detect limits for the unknown profile based on the local node's endpoint structure.
     */
    #detectFallbackProfile(): NetworkProfiles.Limits | undefined {
        const { owner } = this;

        let hasApplicationEndpoint = false;
        for (const part of owner.parts) {
            if (!DeviceClassification.isUtility(part.type.deviceClass)) {
                hasApplicationEndpoint = true;
                break;
            }
        }

        if (!hasApplicationEndpoint) {
            return undefined;
        }

        const nc = owner.behaviors.typeFor(NetworkCommissioningBehavior);
        if (nc?.schema.supportedFeatures.has("TH")) {
            logger.info("Default network profile for unknown peers set to thread");
            return NetworkProfiles.defaults.thread;
        }

        logger.info("Default network profile for unknown peers set to fast");
        return NetworkProfiles.defaults.fast;
    }

    async #initializeGroupNetworking() {
        if (this.#groupNetworking) {
            logger.warn("Group networking already initialized, skipping.");
            return;
        }
        if (this.#ipv6UdpTransport === undefined) {
            logger.warn("No IPv6 UDP interface available, skipping group networking initialization.");
            return;
        }

        this.#groupNetworking = new ServerGroupNetworking(this.owner.env, this.#ipv6UdpTransport);
        await this.#groupNetworking.construction;
    }
}
