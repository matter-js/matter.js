/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { resolvePathForSpecifier, Specifier } from "#action/request/Specifier.js";
import { EndpointNumber } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { OnOff } from "@matter/types/clusters/on-off";

describe("Specifier", () => {
    describe("clusterFor", () => {
        it("returns a bare cluster", () => {
            expect(Specifier.clusterFor(OnOff)).equal(OnOff);
        });

        it("unwraps a host object", () => {
            expect(Specifier.clusterFor({ cluster: OnOff })).equal(OnOff);
        });

        it("throws without a cluster", () => {
            expect(() => Specifier.clusterFor(undefined)).throws(MalformedRequestError, "without a cluster");
        });
    });

    describe("attributeFor", () => {
        it("resolves a cluster attribute by name", () => {
            expect(Specifier.attributeFor(OnOff, "onOff")).equal(OnOff.attributes.onOff);
        });

        it("resolves a global attribute without a cluster", () => {
            expect(Specifier.attributeFor(undefined, "clusterRevision")).not.undefined;
        });

        it("passes an attribute object through", () => {
            expect(Specifier.attributeFor(OnOff, OnOff.attributes.onOff)).equal(OnOff.attributes.onOff);
        });

        it("throws for an unknown attribute name", () => {
            expect(() => Specifier.attributeFor(OnOff, "nope" as never)).throws(
                MalformedRequestError,
                "does not define attribute",
            );
        });

        it("throws for a non-global attribute without a cluster", () => {
            expect(() => Specifier.attributeFor(undefined, "onOff" as never)).throws(
                MalformedRequestError,
                "without a cluster",
            );
        });
    });

    describe("commandFor", () => {
        it("resolves a cluster command by name", () => {
            expect(Specifier.commandFor(OnOff, "toggle")).equal(OnOff.commands.toggle);
        });

        it("passes a command object through", () => {
            expect(Specifier.commandFor(OnOff, OnOff.commands.toggle)).equal(OnOff.commands.toggle);
        });

        it("throws for an unknown command name", () => {
            expect(() => Specifier.commandFor(OnOff, "nope" as never)).throws(
                MalformedRequestError,
                "does not define command",
            );
        });

        it("throws for a command name without a cluster", () => {
            expect(() => Specifier.commandFor(undefined, "toggle")).throws(MalformedRequestError, "without a cluster");
        });
    });

    describe("eventFor", () => {
        it("resolves a cluster event by name", () => {
            expect(Specifier.eventFor(BasicInformation, "startUp")).equal(BasicInformation.events.startUp);
        });

        it("throws for an unknown event name", () => {
            expect(() => Specifier.eventFor(BasicInformation, "nope" as never)).throws(
                MalformedRequestError,
                "does not define event",
            );
        });

        it("throws for an event name without a cluster", () => {
            expect(() => Specifier.eventFor(undefined, "startUp")).throws(MalformedRequestError, "without a cluster");
        });
    });

    describe("clusterOf", () => {
        it("extracts the cluster from a request", () => {
            expect(Specifier.clusterOf({ cluster: OnOff })).equal(OnOff);
        });

        it("returns undefined when no cluster is present", () => {
            expect(Specifier.clusterOf({})).undefined;
        });
    });

    describe("endpointIdOf", () => {
        it("returns a numeric endpoint", () => {
            expect(Specifier.endpointIdOf({ endpoint: EndpointNumber(5) })).equal(5);
        });

        it("returns the number of an endpoint object", () => {
            expect(Specifier.endpointIdOf({ endpoint: { number: EndpointNumber(5) } })).equal(5);
        });

        it("returns undefined when no endpoint is present", () => {
            expect(Specifier.endpointIdOf({})).undefined;
        });
    });

    describe("resolvePathForSpecifier", () => {
        it("resolves an attribute path", () => {
            const path = resolvePathForSpecifier({ endpoint: EndpointNumber(1), cluster: OnOff, attribute: "onOff" });
            expect(path.toString()).equal("1.onOff.state.onOff");
        });

        it("marks a list-add attribute path", () => {
            const path = resolvePathForSpecifier({
                endpoint: EndpointNumber(1),
                cluster: OnOff,
                attribute: "onOff",
                listIndex: null,
            });
            expect(path.toString()).equal("1.onOff.state.onOff[ADD]");
        });

        it("resolves an event path", () => {
            const path = resolvePathForSpecifier({
                endpoint: EndpointNumber(0),
                cluster: BasicInformation,
                event: "startUp",
            });
            expect(path.toString()).equal("0.basicInformation.events.startUp");
        });

        it("marks an urgent event path", () => {
            const path = resolvePathForSpecifier({
                endpoint: EndpointNumber(0),
                cluster: BasicInformation,
                event: "startUp",
                isUrgent: true,
            });
            expect(path.toString()).equal("0.basicInformation.events.startUp!");
        });

        it("resolves a command path", () => {
            const path = resolvePathForSpecifier({ endpoint: EndpointNumber(1), cluster: OnOff, command: "toggle" });
            expect(path.toString()).equal("1.onOff.toggle");
        });

        it("uses wildcards when endpoint, cluster and element are unspecified", () => {
            const path = resolvePathForSpecifier({});
            expect(path.toString()).equal("*.*.*");
        });
    });
});
