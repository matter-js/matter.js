/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "@matter/main";
import { CommissioningController } from "@project-chip/matter.js";
import { expect } from "chai";
import { LegacyControllerCommandHandler } from "../../src/handler/LegacyControllerCommandHandler.js";

/**
 * A controller whose `start()` never settles on its own, so a test decides when — and whether — the
 * handler's own startup completes. Nothing here reaches the real controller: `start()` is the only
 * member the handler's startup touches before the work that follows it.
 */
class ControlledController extends CommissioningController {
    starts = 0;
    #reject?: (error: Error) => void;

    constructor() {
        super({
            environment: { environment: new Environment("legacy-handler-test", Environment.default), id: "alpha" },
            autoConnect: false,
            adminFabricLabel: "alpha",
        });
    }

    override async start() {
        this.starts++;
        return new Promise<void>((_resolve, reject) => {
            this.#reject = reject;
        });
    }

    failStart(error: Error) {
        const reject = this.#reject;
        this.#reject = undefined;
        expect(reject).not.equal(undefined);
        reject?.(error);
    }
}

describe("LegacyControllerCommandHandler startup", () => {
    it("starts the controller once for two commands that arrive together", async () => {
        const controller = new ControlledController();
        const handler = new LegacyControllerCommandHandler("alpha", controller);

        const first = handler.start();
        const second = handler.start();

        // Both callers are waiting on the same start, so the controller has been asked exactly once.
        expect(controller.starts).equal(1);

        controller.failStart(new Error("controller would not come up"));

        await expect(first).rejectedWith("controller would not come up");
        await expect(second).rejectedWith("controller would not come up");
    });

    it("leaves the handler unstarted after a failed start, and tries again on the next command", async () => {
        const controller = new ControlledController();
        const handler = new LegacyControllerCommandHandler("alpha", controller);

        const first = handler.start();
        controller.failStart(new Error("first attempt failed"));
        await expect(first).rejectedWith("first attempt failed");

        expect(handler.started).equal(false);

        const second = handler.start();
        expect(controller.starts).equal(2);

        controller.failStart(new Error("second attempt failed"));
        await expect(second).rejectedWith("second attempt failed");
        expect(handler.started).equal(false);
    });
});
