/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ColorControl } from "#clusters/color-control";
import { OnOff } from "#clusters/on-off";
import { WindowCovering } from "#clusters/window-covering";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";

const WC1 = ClusterBehavior.for(WindowCovering.Cluster.with("Lift"));
const WC2 = ClusterBehavior.for(WindowCovering.Cluster.with("Tilt", "PositionAwareTilt"));
const CC = ClusterBehavior.for(ColorControl.Cluster.with("Xy", "HueSaturation", "EnhancedHue"));
const OO = ClusterBehavior.for(OnOff.Cluster);

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
});
