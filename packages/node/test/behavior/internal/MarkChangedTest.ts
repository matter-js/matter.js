/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { IdentifyServer } from "#behaviors/identify";
import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { ImplementationError } from "@matter/general";
import { Val } from "@matter/protocol";
import { AttributeId, ClusterId } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockServerNode } from "../../node/mock-server-node.js";

const ON_OFF_ATTRIBUTE = AttributeId(OnOff.attributes.onOff.id);

/** Serves onOff from an accessor, so change detection cannot see it change. */
class ComputedOnOffServer extends OnOffServer {
    report(...attributes: string[]) {
        this.markChanged(...attributes);
    }
}

namespace ComputedOnOffServer {
    export class State extends OnOffServer.State {
        /** What the accessor computes from.  Not an attribute, so its own change reports nothing. */
        source = false;

        [Val.properties]() {
            const state = this;
            return {
                get onOff() {
                    return state.source;
                },
            };
        }
    }
}

/**
 * Serves identifyTime, a quieter attribute, from an accessor.  Nothing commits it, so only its own report can move the
 * cluster's data version.
 */
class ComputedQuietServer extends IdentifyServer {
    override initialize() {
        const result = super.initialize();
        this.events.identifyTime$Changed.quiet.config = { suppressionEnabled: false };
        return result;
    }

    announce(value: number) {
        this.events.identifyTime$Changed.emit(value, 0, this.context);
    }
}

namespace ComputedQuietServer {
    export class State extends IdentifyServer.State {
        source = 0;

        [Val.properties]() {
            const state = this;
            return {
                get identifyTime() {
                    return state.source;
                },
            };
        }
    }
}

/** upTime carries the changes-omitted quality, so it never reports. */
class OmittedDiagnosticsServer extends GeneralDiagnosticsServer {
    report(...attributes: string[]) {
        this.markChanged(...attributes);
    }
}

/** identifyTime carries the quieter quality, so it reports through its own event rather than directly. */
class QuietIdentifyServer extends IdentifyServer {
    report(...attributes: string[]) {
        this.markChanged(...attributes);
    }
}

const ComputedLight = OnOffLightDevice.with(ComputedOnOffServer);

async function computedNode() {
    const device = new Endpoint(ComputedLight, { number: 1 });
    const node = await MockServerNode.createOnline(undefined, { device });

    const reported = new Array<AttributeId>();
    node.protocol.attrsChanged.on((_endpointId, clusterId, attrs) => {
        if (clusterId === ClusterId(OnOff.id)) {
            reported.push(...attrs);
        }
    });

    return { node, device, reported, [Symbol.asyncDispose]: () => node.close() };
}

describe("markChanged", () => {
    it("reports an attribute the behavior computes on read", async () => {
        await using ctx = await computedNode();

        await ctx.device.act(agent => agent.get(ComputedOnOffServer).report("onOff"));

        expect(ctx.reported).deep.equals([ON_OFF_ATTRIBUTE]);
    });

    it("advances the data version, which nothing else does for a computed value", async () => {
        await using ctx = await computedNode();

        const before = ctx.device.behaviors.versionOf(ComputedOnOffServer);

        await ctx.device.act(agent => agent.get(ComputedOnOffServer).report("onOff"));

        expect(ctx.device.behaviors.versionOf(ComputedOnOffServer)).equals(before + 1);
    });

    it("refuses a report that names no attribute", async () => {
        await using ctx = await computedNode();

        const before = ctx.device.behaviors.versionOf(ComputedOnOffServer);

        await expect(ctx.device.act(async agent => agent.get(ComputedOnOffServer).report())).rejectedWith(
            ImplementationError,
            /without naming an attribute/,
        );

        expect(ctx.device.behaviors.versionOf(ComputedOnOffServer)).equals(before);
    });

    it("refuses an attribute the behavior does not support", async () => {
        await using ctx = await computedNode();

        await expect(ctx.device.act(async agent => agent.get(ComputedOnOffServer).report("nonexistent"))).rejectedWith(
            ImplementationError,
            /not an attribute/,
        );
    });

    it("refuses a state field that is not an attribute", async () => {
        await using ctx = await computedNode();

        await expect(ctx.device.act(async agent => agent.get(ComputedOnOffServer).report("source"))).rejectedWith(
            ImplementationError,
            /not an attribute/,
        );
    });

    it("refuses a quieter attribute, which reports through its own throttled event", async () => {
        const device = new Endpoint(OnOffLightDevice.with(QuietIdentifyServer), { number: 1 });
        await using _node = await MockServerNode.createOnline(undefined, { device });

        await expect(device.act(async agent => agent.get(QuietIdentifyServer).report("identifyTime"))).rejectedWith(
            ImplementationError,
            /so its throttle applies/,
        );
    });

    it("refuses an attribute the specification omits change reporting for", async () => {
        await using node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint.with(OmittedDiagnosticsServer),
        });

        // upTime carries the changes-omitted quality
        await expect(node.act(async agent => agent.get(OmittedDiagnosticsServer).report("upTime"))).rejectedWith(
            ImplementationError,
            /omits change reporting/,
        );
    });

    // Structural: a client backing inherits this implementation, so a peer's version is never advanced here
    it("carries an implementation that refuses, for backings that do not own their version", () => {
        expect(() => BehaviorBacking.prototype.markChanged.call({ toString: () => "peer" }, ["onOff"])).throws(
            ImplementationError,
            /only a server behavior/,
        );
    });

    it("advances the data version when a computed quieter attribute reports through its throttle", async () => {
        const device = new Endpoint(OnOffLightDevice.with(ComputedQuietServer), { number: 1 });
        await using _node = await MockServerNode.createOnline(undefined, { device });

        const before = device.behaviors.versionOf(ComputedQuietServer);

        await device.act(agent => agent.get(ComputedQuietServer).announce(5));

        expect(device.behaviors.versionOf(ComputedQuietServer)).equals(before + 1);
    });

    it("serves the attribute from the accessor rather than a stored slot", async () => {
        await using ctx = await computedNode();

        await ctx.device.set({ onOff: { source: true } });

        expect(ctx.device.stateOf(ComputedOnOffServer).onOff).equals(true);
        expect(ctx.reported).deep.equals([]);
    });
});
