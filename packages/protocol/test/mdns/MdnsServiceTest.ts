/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MdnsService } from "#mdns/MdnsService.js";
import { Entropy, Environment, Lifecycle, MockCrypto, Network, NetworkSimulator } from "@matter/general";

function createEnvironment() {
    const environment = new Environment("mdns");
    environment.set(Entropy, MockCrypto(1));
    environment.set(Network, new NetworkSimulator().addHost(1));
    return environment;
}

describe("MdnsService", () => {
    before(() => {
        MockTime.init();
    });

    it("closes on runtime cancel when no dependent holds it, and the next load creates a new instance", async () => {
        using environment = createEnvironment();
        const mdns = await environment.load(MdnsService);

        await MockTime.resolve(environment.runtime.close(), { macrotasks: true });

        expect(mdns.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(environment.has(MdnsService)).false;

        const next = await MockTime.resolve(environment.load(MdnsService));
        expect(next).not.equal(mdns);
        expect(next.construction.status).equals(Lifecycle.Status.Active);

        await MockTime.resolve(environment.runtime.close(), { macrotasks: true });
    });

    it("keeps the runtime active after a cancel until the last dependent released the service", async () => {
        using environment = createEnvironment();
        const dependent = environment.asDependent();
        const mdns = await MockTime.resolve(dependent.load(MdnsService));
        let stopped = false;
        environment.runtime.stopped.once(() => {
            stopped = true;
        });

        environment.runtime.cancel();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });

        expect(mdns.construction.status).equals(Lifecycle.Status.Active);
        expect(stopped).false;

        await MockTime.resolve(dependent.close());
        await MockTime.resolve(environment.runtime.inactive, { macrotasks: true });

        expect(mdns.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(environment.has(MdnsService)).false;

        await MockTime.resolve(environment.runtime.close());
    });

    it("stays open when the runtime takes on work after a cancel that came while the service was starting", async () => {
        using environment = createEnvironment();
        const mdns = environment.get(MdnsService);

        let finishWork!: () => void;
        const work = new Promise<void>(resolve => (finishWork = resolve));

        environment.runtime.cancel();
        environment.runtime.add(work);
        await MockTime.resolve(mdns.construction);
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });

        expect(mdns.construction.status).equals(Lifecycle.Status.Active);

        finishWork();
        await MockTime.resolve(environment.runtime.close(), { macrotasks: true });
    });
});
