/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { RootEndpoint } from "#endpoints/root";
import { DeviceClassification } from "#model";
import { DeviceTypeId } from "#types";
import { MockBehavior1, MockBehavior2 } from "../mock-endpoint.js";

const Identity = {
    name: "Base",
    deviceType: 1,
    deviceRevision: 2,
} as const;

const IdentityProps = {
    name: "Base",
    deviceType: 1 as DeviceTypeId,
    deviceRevision: 2 as number,
    deviceClass: DeviceClassification.Simple as DeviceClassification,
} as const;

const IdentityWithBehaviors = {
    ...Identity,
    behaviors: SupportedBehaviors(MockBehavior1, MockBehavior2),
} as const;

const IdentityWithBehaviorsProps = {
    ...IdentityProps,
    behaviors: {
        one: MockBehavior1,
        two: MockBehavior2,
    } as const,
} as const;

function expectIdentity<T extends typeof IdentityProps>(type: T) {
    for (const name in IdentityProps) {
        expect((type as any)[name]).equals((IdentityProps as any)[name]);
    }
}

function expectIdentityWithBehaviors<T extends typeof IdentityWithBehaviorsProps>(type: T) {
    expectIdentity(type);
    expect(type.behaviors).deep.equals(IdentityWithBehaviorsProps.behaviors);
}

export interface Defaults {
    one: {
        b1e: string;
        b1f: string;
    };

    two: {
        b2e: string;
        b2f: string;
    };
}

function expectDefaults(actual: Defaults, expected: Defaults) {
    expect(Object.keys(actual)).length(2);

    expect(typeof actual.one).equals("object");
    expect(Object.keys(actual.one)).length(2);
    expect(actual.one.b1e).equals(expected.one.b1e);
    expect(actual.one.b1f).equals(expected.one.b1f);

    expect(typeof actual.two).equals("object");
    expect(Object.keys(actual.two)).length(2);
    expect(actual.two.b2e).equals(expected.two.b2e);
    expect(actual.two.b2f).equals(expected.two.b2f);
}

describe("MutableEndpoint", () => {
    it("sets fields without behavior", () => {
        const Type = MutableEndpoint(Identity);

        expectIdentity(Type);

        expect(Type.behaviors).deep.equals({});
        expect(Type.requirements).deep.equals({});
    });

    it("sets fields with behaviors", () => {
        const Type = MutableEndpoint(IdentityWithBehaviors);
        expectIdentityWithBehaviors(Type);
    });

    it("extends with two behaviors", () => {
        const Type = MutableEndpoint(Identity).with(MockBehavior1, MockBehavior2);
        expectIdentityWithBehaviors(Type);
    });

    it("supports withBehavior alias", () => {
        const Type = MutableEndpoint(Identity).withBehaviors(MockBehavior1, MockBehavior2);
        expectIdentityWithBehaviors(Type);
    });

    it("RootEndpoint supports withBehavior", () => {
        const Type = RootEndpoint.withBehaviors(MockBehavior1, MockBehavior2);
        expect(Type.behaviors.one).not.undefined;
        expect(Type.behaviors.two).not.undefined;
    });

    it("extends with one behavior twice", () => {
        const Type = MutableEndpoint(Identity).with(MockBehavior1).with(MockBehavior2);
        expectIdentityWithBehaviors(Type);
    });

    it("extracts defaults", () => {
        const Type = MutableEndpoint(IdentityWithBehaviors);

        Type.defaults satisfies Defaults;

        expectDefaults(Type.defaults, {
            one: {
                b1e: "foo",
                b1f: "bar",
            },

            two: {
                b2e: "biz",
                b2f: "baz",
            },
        });
    });

    it("sets defaults", () => {
        const Type = MutableEndpoint(IdentityWithBehaviors).set({
            one: {
                b1e: "oof",
                b1f: "rab",
            },

            two: {
                b2e: "zib",
                b2f: "zab",
            },
        });

        expectIdentity(Type);

        Type.defaults satisfies Defaults;

        expectDefaults(Type.defaults, {
            one: {
                b1e: "oof",
                b1f: "rab",
            },

            two: {
                b2e: "zib",
                b2f: "zab",
            },
        });
    });
});
