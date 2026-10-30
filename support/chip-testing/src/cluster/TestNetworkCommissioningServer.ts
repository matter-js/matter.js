/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent, Bytes, Environment } from "@matter/main";
import { GeneralCommissioningServer } from "@matter/main/behaviors/general-commissioning";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { NetworkCommissioning } from "@matter/main/clusters/network-commissioning";
import { DeviceCommissioner, OperationalDataset, ThreadDatasetError, ThreadTlvError } from "@matter/main/protocol";

import NetworkingStatus = NetworkCommissioning.NetworkCommissioningStatus;

/** The state both test servers change. */
interface NetworkState {
    networks: NetworkCommissioning.NetworkInfo[];
    maxNetworks: number;
    lastNetworkingStatus: NetworkingStatus | null;
    lastNetworkId: Bytes | null;
    lastConnectErrorValue: number | null;
}

/** What a command needs from the server it runs in. */
interface NetworkCommand {
    state: NetworkState;
    commissioner: DeviceCommissioner;
    setBreadcrumb(breadcrumb: number | bigint | undefined): void;
}

function networkCommand(state: NetworkState, env: Environment, agent: Agent): NetworkCommand {
    return {
        state,
        commissioner: env.get(DeviceCommissioner),
        setBreadcrumb: breadcrumb => {
            if (breadcrumb !== undefined) {
                agent.get(GeneralCommissioningServer).state.breadcrumb = breadcrumb;
            }
        },
    };
}

/**
 * The Extended PAN ID of `dataset`, or `undefined` where the dataset is malformed or has none. An invalid dataset gets
 * a NetworkConfigResponse that names the error, not a failure status (§ 11.9.7.5).
 */
function extendedPanIdOf(dataset: Bytes) {
    try {
        return OperationalDataset.decode(dataset).extPanId;
    } catch (e) {
        if (e instanceof ThreadDatasetError || e instanceof ThreadTlvError) {
            return undefined;
        }
        throw e;
    }
}

function indexOf(networks: NetworkCommissioning.NetworkInfo[], networkId: Bytes) {
    return networks.findIndex(network => Bytes.areEqual(network.networkId, networkId));
}

/**
 * Sets LastNetworkingStatus and LastNetworkID before a NetworkConfigResponse that refuses the change.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9.7.7
 */
function refuse(
    { state }: NetworkCommand,
    networkId: Bytes,
    networkingStatus: NetworkingStatus,
): NetworkCommissioning.NetworkConfigResponse {
    state.lastNetworkingStatus = networkingStatus;
    state.lastNetworkId = networkId;
    return { networkingStatus };
}

/**
 * Sets LastNetworkingStatus, LastNetworkID and the Breadcrumb before a NetworkConfigResponse that reports success.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9.7.7
 */
function succeed(
    command: NetworkCommand,
    networkId: Bytes,
    networkIndex: number,
    breadcrumb: number | bigint | undefined,
): NetworkCommissioning.NetworkConfigResponse {
    command.state.lastNetworkingStatus = NetworkingStatus.Success;
    command.state.lastNetworkId = networkId;
    command.setBreadcrumb(breadcrumb);
    return { networkingStatus: NetworkingStatus.Success, networkIndex };
}

/** @see {@link MatterSpecification.v161.Core} § 11.9.7.3 and § 11.9.7.4 */
function addOrUpdate(command: NetworkCommand, networkId: Bytes, breadcrumb: number | bigint | undefined) {
    const { state } = command;
    const index = indexOf(state.networks, networkId);
    if (index !== -1) {
        return succeed(command, networkId, index, breadcrumb);
    }
    if (state.networks.length >= state.maxNetworks) {
        return refuse(command, networkId, NetworkingStatus.BoundsExceeded);
    }
    state.networks = [...state.networks, { networkId, connected: false }];
    return succeed(command, networkId, state.networks.length - 1, breadcrumb);
}

/** @see {@link MatterSpecification.v161.Core} § 11.9.7.6 */
function remove(command: NetworkCommand, { networkId, breadcrumb }: NetworkCommissioning.RemoveNetworkRequest) {
    command.commissioner.assertFailsafeArmed();
    const { state } = command;
    const index = indexOf(state.networks, networkId);
    if (index === -1) {
        return refuse(command, networkId, NetworkingStatus.NetworkIdNotFound);
    }
    state.networks = state.networks.filter((_network, i) => i !== index);
    return succeed(command, networkId, index, breadcrumb);
}

/**
 * Marks the network connected without touching any interface, since the TH stays on the network it runs on.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9.7.8
 */
function connect(
    command: NetworkCommand,
    { networkId, breadcrumb }: NetworkCommissioning.ConnectNetworkRequest,
): NetworkCommissioning.ConnectNetworkResponse {
    command.commissioner.assertFailsafeArmed();
    const { state } = command;
    const index = indexOf(state.networks, networkId);
    const networkingStatus = index === -1 ? NetworkingStatus.NetworkIdNotFound : NetworkingStatus.Success;
    if (index !== -1) {
        state.networks = state.networks.map((network, i) => ({ ...network, connected: i === index }));
        command.setBreadcrumb(breadcrumb);
    }
    state.lastNetworkingStatus = networkingStatus;
    state.lastNetworkId = networkId;
    state.lastConnectErrorValue = null;
    return { networkingStatus, errorValue: null };
}

/**
 * Needs no fail-safe, as chip's server does not; the specification names none either.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9.7.10
 */
function reorder(
    command: NetworkCommand,
    { networkId, networkIndex, breadcrumb }: NetworkCommissioning.ReorderNetworkRequest,
) {
    const { state } = command;
    const index = indexOf(state.networks, networkId);
    if (index === -1) {
        return refuse(command, networkId, NetworkingStatus.NetworkIdNotFound);
    }
    if (networkIndex >= state.networks.length) {
        return refuse(command, networkId, NetworkingStatus.OutOfRange);
    }
    const networks = state.networks.filter((_network, i) => i !== index);
    networks.splice(networkIndex, 0, state.networks[index]);
    state.networks = networks;
    return succeed(command, networkId, networkIndex, breadcrumb);
}

/**
 * Wi-Fi network configuration for a TH that runs on Ethernet or Wi-Fi it does not manage. It keeps the Networks list
 * as the commands change it and answers success where the specification and chip's server do. It scans no radio, so
 * a scan finds no network.
 *
 * ScanNetworks needs no fail-safe, as on chip's server. Matter 1.6.1 requires one (§ 11.9.7.1), but the DUT-client
 * test plans send ScanNetworks before ArmFailSafe. The other commands but ReorderNetwork answer FAILSAFE_REQUIRED
 * without an armed fail-safe. chip requires the fail-safe of the accessing fabric; this server accepts any armed
 * fail-safe. When a fail-safe expires, the node's fail-safe context restores the Networks list it saved at
 * ArmFailSafe.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9
 */
export class TestWiFiNetworkCommissioningServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override scanNetworks({ breadcrumb }: NetworkCommissioning.ScanNetworksRequest) {
        const networkingStatus = NetworkingStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;
        this.#command.setBreadcrumb(breadcrumb);
        return { networkingStatus, wiFiScanResults: [] };
    }

    override addOrUpdateWiFiNetwork({ ssid, breadcrumb }: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest) {
        const command = this.#command;
        command.commissioner.assertFailsafeArmed();
        return addOrUpdate(command, ssid, breadcrumb);
    }

    override removeNetwork(request: NetworkCommissioning.RemoveNetworkRequest) {
        return remove(this.#command, request);
    }

    override connectNetwork(request: NetworkCommissioning.ConnectNetworkRequest) {
        return connect(this.#command, request);
    }

    override reorderNetwork(request: NetworkCommissioning.ReorderNetworkRequest) {
        return reorder(this.#command, request);
    }

    get #command() {
        return networkCommand(this.state, this.env, this.agent);
    }
}

/**
 * Thread network configuration for a TH that runs on Ethernet or Wi-Fi it does not manage. It answers like
 * {@link TestWiFiNetworkCommissioningServer}. The Extended PAN ID of a dataset is its NetworkID; a malformed dataset or
 * one without an Extended PAN ID gets OutOfRange.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.9
 */
export class TestThreadNetworkCommissioningServer extends NetworkCommissioningServer.with("ThreadNetworkInterface") {
    override scanNetworks({ breadcrumb }: NetworkCommissioning.ScanNetworksRequest) {
        const networkingStatus = NetworkingStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;
        this.#command.setBreadcrumb(breadcrumb);
        return { networkingStatus, threadScanResults: [] };
    }

    override addOrUpdateThreadNetwork({
        operationalDataset,
        breadcrumb,
    }: NetworkCommissioning.AddOrUpdateThreadNetworkRequest) {
        const command = this.#command;
        command.commissioner.assertFailsafeArmed();
        const networkId = extendedPanIdOf(operationalDataset);
        if (networkId === undefined) {
            this.state.lastNetworkingStatus = NetworkingStatus.OutOfRange;
            return { networkingStatus: NetworkingStatus.OutOfRange, debugText: "Dataset has no valid Extended PAN ID" };
        }
        return addOrUpdate(command, networkId, breadcrumb);
    }

    override removeNetwork(request: NetworkCommissioning.RemoveNetworkRequest) {
        return remove(this.#command, request);
    }

    override connectNetwork(request: NetworkCommissioning.ConnectNetworkRequest) {
        return connect(this.#command, request);
    }

    override reorderNetwork(request: NetworkCommissioning.ReorderNetworkRequest) {
        return reorder(this.#command, request);
    }

    get #command() {
        return networkCommand(this.state, this.env, this.agent);
    }
}
