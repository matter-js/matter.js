/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPromise, PromiseTimeoutError, Seconds } from "@matter/general";
import { BleError } from "@matter/protocol";
import { ScanControl } from "../src/ScanControl.js";

/** A radio that reports its scan through the control's events, as noble emits scanStart and scanStop. */
class FakeRadio {
    readonly calls = new Array<"start" | "stop">();
    control!: ScanControl;

    /** Leaves the next call in flight until {@link finish} or forever. */
    hold = false;

    /** Fails the next start at once, as noble does for an adapter that is not powered on. */
    failStart?: Error;
    #finish?: () => void;

    start() {
        this.calls.push("start");
        const failure = this.failStart;
        if (failure !== undefined) {
            this.failStart = undefined;
            return Promise.reject(failure);
        }
        return this.#settle(() => this.control.started());
    }

    stop() {
        this.calls.push("stop");
        return this.#settle(() => this.control.stopped());
    }

    finish() {
        this.#finish?.();
    }

    async #settle(report: () => void) {
        if (this.hold) {
            this.hold = false;
            const { promise, resolver } = createPromise<void>();
            this.#finish = () => {
                report();
                resolver();
            };
            return promise;
        }
        report();
    }
}

function controlFor(available = true) {
    const radio = new FakeRadio();
    const control = new ScanControl(radio, available);
    radio.control = control;
    return { radio, control };
}

async function settle() {
    for (let i = 0; i < 10; i++) {
        await MockTime.yield();
    }
}

describe("ScanControl", () => {
    beforeEach(() => MockTime.reset());
    after(() => MockTime.disable());

    it("starts the scan that is wanted and stops it when no longer wanted", async () => {
        const { radio, control } = controlFor();

        await control.want(true);
        expect(control.scanning).equal(true);

        await control.want(false);
        expect(control.scanning).equal(false);
        expect(radio.calls).deep.equal(["start", "stop"]);
    });

    it("does not ask the radio again while it scans", async () => {
        const { radio, control } = controlFor();

        await control.want(true);
        await control.want(true);

        expect(radio.calls).deep.equal(["start"]);
    });

    it("waits for the adapter and starts the wanted scan once it is available", async () => {
        const { radio, control } = controlFor(false);

        await control.want(true);
        expect(radio.calls).deep.equal([]);

        control.setAvailable(true);
        await settle();
        expect(radio.calls).deep.equal(["start"]);
        expect(control.scanning).equal(true);
    });

    it("starts the wanted scan again after the adapter powered off and on", async () => {
        const { radio, control } = controlFor();
        await control.want(true);

        control.setAvailable(false);
        expect(control.scanning).equal(false);

        control.setAvailable(true);
        await settle();
        expect(radio.calls).deep.equal(["start", "start"]);
        expect(control.scanning).equal(true);
    });

    it("leaves a scan the radio stopped on its own stopped until asked again", async () => {
        const { radio, control } = controlFor();
        await control.want(true);

        // As noble does before it connects
        control.stopped();
        await settle();
        expect(radio.calls).deep.equal(["start"]);

        await control.want(true);
        expect(radio.calls).deep.equal(["start", "start"]);
    });

    it("leaves alone a scan another user of the adapter started", async () => {
        const { radio, control } = controlFor();

        control.started();
        await settle();

        expect(radio.calls).deep.equal([]);
        expect(control.scanning).equal(false);
    });

    it("does not count a scan it did not start while it wants one", async () => {
        const { control } = controlFor(false);
        await control.want(true);

        // As noble reports during a connect, without a matching scanStop
        control.started();

        expect(control.scanning).equal(false);
    });

    it("no longer awaits its start once the radio reported a stop", async () => {
        const { radio, control } = controlFor();
        radio.hold = true;
        const starting = control.want(true);
        await settle();

        control.stopped();
        control.started();
        expect(control.scanning).equal(false);

        radio.finish();
        await starting;
    });

    it("no longer awaits its start once the adapter became unavailable", async () => {
        const { radio, control } = controlFor();
        radio.hold = true;
        const starting = control.want(true);
        await settle();

        control.setAvailable(false);
        control.started();
        expect(control.scanning).equal(false);

        radio.finish();
        await starting;
    });

    it("no longer awaits a start the radio refused at once", async () => {
        const { radio, control } = controlFor();
        radio.failStart = new BleError("not powered on");
        await expect(control.want(true)).rejectedWith("not powered on");

        control.started();
        expect(control.scanning).equal(false);
    });

    it("stops its own scan that starts after its request was given up", async () => {
        const { radio, control } = controlFor();

        radio.hold = true;
        const starting = expect(control.want(true)).rejectedWith(PromiseTimeoutError);
        await settle();
        await MockTime.advance(Seconds(6));
        await starting;
        await control.want(false);
        expect(radio.calls).deep.equal(["start"]);

        radio.finish();
        await settle();

        expect(radio.calls).deep.equal(["start", "stop"]);
        expect(control.scanning).equal(false);
    });

    it("stops a timed-out start that takes effect late although a retry was refused meanwhile", async () => {
        const { radio, control } = controlFor();

        radio.hold = true;
        const timedOut = expect(control.want(true)).rejectedWith(PromiseTimeoutError);
        await settle();
        await MockTime.advance(Seconds(6));
        await timedOut;

        radio.failStart = new BleError("not powered on");
        await expect(control.want(true)).rejectedWith("not powered on");
        await control.want(false);

        radio.finish();
        await settle();

        expect(radio.calls).deep.equal(["start", "start", "stop"]);
        expect(control.scanning).equal(false);
    });

    it("stops the scan once a start still in flight completes after the scan is no longer wanted", async () => {
        const { radio, control } = controlFor();

        radio.hold = true;
        const starting = control.want(true);
        await settle();
        const stopping = control.want(false);
        await settle();
        expect(radio.calls).deep.equal(["start"]);

        radio.finish();
        await starting;
        await stopping;
        await settle();

        expect(radio.calls).deep.equal(["start", "stop"]);
        expect(control.scanning).equal(false);
    });

    it("fails only the request whose radio call failed", async () => {
        const { radio, control } = controlFor();
        await control.want(true);

        radio.hold = true;
        const stopping = expect(control.want(false)).rejectedWith(PromiseTimeoutError);
        await settle();
        expect(radio.calls).deep.equal(["start", "stop"]);
        const starting = control.want(true);
        await MockTime.advance(Seconds(6));

        await stopping;
        await starting;
    });

    it("fails a radio call that never settles and serves the next request", async () => {
        const { radio, control } = controlFor();

        radio.hold = true;
        const starting = expect(control.want(true)).rejectedWith(PromiseTimeoutError);
        await settle();
        await MockTime.advance(Seconds(6));
        await starting;

        radio.finish();
        await settle();
        expect(control.scanning).equal(true);
        await control.want(false);
        expect(radio.calls).deep.equal(["start", "stop"]);
    });

    it("leaves the radio alone once closed", async () => {
        const { radio, control } = controlFor();
        control.close();

        await control.want(true);
        control.setAvailable(true);
        await settle();

        expect(radio.calls).deep.equal([]);
    });
});
