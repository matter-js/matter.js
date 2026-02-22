/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { Bytes } from "#util/Bytes.js";

const logger = Logger.get("MockRouter");

export interface MockRouter extends MockRouter.Route {
    intercept(route: MockRouter.Interceptor): void;
    add(route: MockRouter.Route): void;
    delete(route: MockRouter.Route): void;
}

export function MockRouter(): MockRouter {
    const routes = new Set<MockRouter.Route>();

    let route = (packet: MockRouter.Packet) => {
        for (const route of routes) {
            Promise.resolve()
                .then(() => route(packet))
                .catch(e => logger.error("Unhandled error in network listener", e));
        }
    };

    const router = function router(packet: MockRouter.Packet) {
        route(packet);
    } as MockRouter;

    router.intercept = intercept => {
        const next = route;
        route = packet => {
            intercept(packet, next);
        };
    };
    router.add = routes.add.bind(routes);
    router.delete = routes.delete.bind(routes);

    return router;
}

export namespace MockRouter {
    /**
     * A mock network packet.
     *
     * Currently we only support UDP.
     */
    export interface Packet {
        kind: "udp";
        sourceAddress: string;
        sourcePort: number;
        destAddress: string;
        destPort: number;
        payload: Bytes;
    }

    /**
     * A route.
     *
     * Takes a packet and does something with it.
     */
    export interface Route {
        (packet: Packet): void;
    }

    /**
     * A route wrapper.
     *
     * Takes a packet and a route.  Does something with {@link packet}, optionally passing along to {@link route} to
     * allow normal routing to proceed.
     */
    export interface Interceptor {
        (packet: Packet, route: Route): void;
    }
}
