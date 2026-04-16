/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { ColorControl } from "@matter/types/clusters/color-control";
import { OnOff } from "@matter/types/clusters/on-off";
import { WindowCovering } from "@matter/types/clusters/window-covering";

const WC1 = ClusterBehavior.for(WindowCovering).with("Lift");
const WC2 = ClusterBehavior.for(WindowCovering).with("Tilt", "PositionAwareTilt");
const CC = ClusterBehavior.for(ColorControl).with("Xy", "HueSaturation", "EnhancedHue");
const OO = ClusterBehavior.for(OnOff);

type WC1 = typeof WC1;
type WC2 = typeof WC2;
type CC = typeof CC;
type OO = typeof OO;

describe("SupportedBehaviors", () => {
    type IsNever<T> = [T] extends [never] ? true : false;

    it("extends empty", () => {
        const sb = SupportedBehaviors.extend({}, []);
        ({}) as IsNever<typeof sb> satisfies false;
        expect(sb).deep.equal({});
    });

    it("instantiates empty to full", () => {
        const fake = {} as SupportedBehaviors.With<{}, [WC1, CC]>;
        fake satisfies { windowCovering: WC1; colorControl: CC };
        ({}) as IsNever<typeof fake> satisfies false;

        const sb = SupportedBehaviors.extend({}, [WC1, CC]);
        sb satisfies { windowCovering: WC1; colorControl: CC };
        ({}) as IsNever<typeof sb> satisfies false;
        expect(sb).deep.equal({ windowCovering: WC1, colorControl: CC });
    });

    it("extends twice", () => {
        const fake = {} as SupportedBehaviors.With<{ windowCovering: WC1 }, [CC]>;
        fake satisfies { windowCovering: WC1; colorControl: CC };
        ({}) as IsNever<typeof fake> satisfies false;

        const sb1 = SupportedBehaviors.extend({}, [WC1]);
        const sb2 = SupportedBehaviors.extend(sb1, [CC]);
        sb2 satisfies { windowCovering: WC1; colorControl: CC };
        ({}) as IsNever<typeof sb2> satisfies false;
        expect(sb2).deep.equal({ windowCovering: WC1, colorControl: CC });
    });

    it("replaces and extends", () => {
        const fake = {} as SupportedBehaviors.With<{ windowCovering: WC1; colorControl: CC }, [OO, CC, WC2]>;
        fake satisfies { windowCovering: WC2; colorControl: CC; onOff: OO };
        ({}) as IsNever<typeof fake> satisfies false;

        const sb = SupportedBehaviors.extend({ windowCovering: WC1, colorControl: CC }, [OO, CC, WC2]);
        sb satisfies { windowCovering: WC2; colorControl: CC; onOff: OO };
        ({}) as IsNever<typeof sb> satisfies false;
        expect(sb).deep.equal({ windowCovering: WC2, colorControl: CC, onOff: OO });
    });

    it("rejects behavior ID starting with uppercase", () => {
        class UpperBehavior extends Behavior {
            static override readonly id = "GCEvents";
        }

        expect(() => {
            SupportedBehaviors(UpperBehavior);
        }).throws('Behavior ID "GCEvents" must start with a lowercase letter');
    });

    it("accepts behavior ID starting with lowercase", () => {
        class LowerBehavior extends Behavior {
            static override readonly id = "gcEvents";
        }

        const sb = SupportedBehaviors(LowerBehavior);
        expect(sb).deep.equal({ gcEvents: LowerBehavior });
    });

    it("accepts hyphenated behavior ID", () => {
        class HyphenBehavior extends Behavior {
            static override readonly id = "test-plugin";
        }

        const sb = SupportedBehaviors(HyphenBehavior);
        expect(sb).deep.equal({ "test-plugin": HyphenBehavior });
    });
});
