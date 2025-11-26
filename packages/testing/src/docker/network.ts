/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import Dockerode from "dockerode";
import { Docker } from "./docker.js";
import { DockerError } from "./errors.js";

export interface Network {
    name: string;

    configure(config: Network.Configuration): Promise<void>;
    inspect(): Promise<Network.Configuration | undefined>;
    erase(): Promise<void>;
}

export function Network(docker: Docker, name: string): Network {
    async function configure(config: Network.Configuration) {
        const { subnets, hostInterfaceName, containerInterfacePrefix } = config;
        let existing = await inspect();

        if (existing) {
            if (
                (config.subnets && JSON.stringify(existing.subnets) !== JSON.stringify(subnets)) ||
                (hostInterfaceName !== undefined && existing.hostInterfaceName !== hostInterfaceName) ||
                (containerInterfacePrefix !== undefined &&
                    existing.containerInterfacePrefix !== containerInterfacePrefix)
            ) {
                await erase();
                existing = undefined;
            }
        }

        if (existing === undefined) {
            const options: Dockerode.NetworkCreateOptions = {
                Name: name,
                EnableIPv6: true,
            };

            if (subnets) {
                options.IPAM = {
                    Driver: "bridge",
                    Config: subnets.map(Subnet => ({ Subnet })),
                };
            }

            if (hostInterfaceName) {
                if (!options.Options) {
                    options.Options = {};
                }
                options.Options["com.docker.network.bridge.name"] = hostInterfaceName;
            }

            if (containerInterfacePrefix) {
                if (!options.Options) {
                    options.Options = {};
                }
                options.Options["com.docker.network.bridge.container_iface_prefix"] = containerInterfacePrefix;
            }

            await DockerError.adapt(docker.intf.createNetwork(options));
        }
    }

    async function erase() {
        const net = docker.intf.getNetwork(name);
        try {
            await DockerError.adapt(net.remove());
        } catch (e) {
            DockerError.accept(e, 404);
        }
    }

    async function inspect(): Promise<Network.Configuration | undefined> {
        const net = docker.intf.getNetwork(name);
        let inspection: Dockerode.NetworkInspectInfo;
        try {
            inspection = await DockerError.adapt(net.inspect());
        } catch (e) {
            DockerError.accept(e, 404);
            return undefined;
        }

        return {
            subnets: inspection.IPAM?.Config?.map(c => c.Subnet).filter(subnet => subnet !== undefined),
            hostInterfaceName: inspection.Options?.["com.docker.network.bridge.name"],
            containerInterfacePrefix: inspection.Options?.["com.docker.network.container_iface_prefix"],
        };
    }

    return {
        name,
        configure,
        erase,
        inspect,
    };
}

export namespace Network {
    export interface Configuration {
        subnets?: string[];
        hostInterfaceName?: string;
        containerInterfacePrefix?: string;
    }
}
