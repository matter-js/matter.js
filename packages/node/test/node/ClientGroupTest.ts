/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientGroup } from "#node/ClientGroup.js";
import { InvalidGroupOperationError } from "#node/client/ClientGroupInteraction.js";

describe("ClientGroup", () => {
    it("throws InvalidGroupOperationError on get()", async () => {
        // get() throws before accessing instance state, so we can exercise it via prototype
        const group = Object.create(ClientGroup.prototype) as ClientGroup;
        let threw = false;
        try {
            await group.get();
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(InvalidGroupOperationError);
            expect((e as Error).message).to.equal("Groups do not support reading attributes");
        }
        expect(threw).to.be.true;
    });

    it("throws InvalidGroupOperationError on getStateOf()", async () => {
        const group = Object.create(ClientGroup.prototype) as ClientGroup;
        let threw = false;
        try {
            await group.getStateOf("someCluster");
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(InvalidGroupOperationError);
            expect((e as Error).message).to.equal("Groups do not support reading attributes");
        }
        expect(threw).to.be.true;
    });
});
