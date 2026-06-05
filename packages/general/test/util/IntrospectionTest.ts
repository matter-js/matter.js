/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Introspection } from "#util/Introspection.js";

class Base {
    baseProp = 1;
    get derived() {
        return 2;
    }
}

class Derived extends Base {
    ownProp = 3;
}

describe("Introspection", () => {
    describe("propertyDescriptorOf", () => {
        it("finds an own property", () => {
            const subject = new Derived();
            const pd = Introspection.propertyDescriptorOf(subject, "ownProp");

            expect(pd?.value).equal(3);
        });

        it("walks the prototype chain for a getter", () => {
            const subject = new Derived();
            const pd = Introspection.propertyDescriptorOf(subject, "derived");

            expect(typeof pd?.get).equal("function");
        });

        it("returns undefined for an unknown property", () => {
            expect(Introspection.propertyDescriptorOf(new Derived(), "missing")).undefined;
        });
    });

    describe("propertyDescriptorsOf", () => {
        it("collects descriptors across the prototype chain", () => {
            const descriptors = Introspection.propertyDescriptorsOf(new Derived());

            expect(descriptors).property("ownProp");
            expect(descriptors).property("derived");
        });
    });

    describe("propertyDescriptorToAccessibility", () => {
        it("treats a writable data property as readable and writable", () => {
            expect(Introspection.propertyDescriptorToAccessibility({ value: 1, writable: true })).deep.equal({
                readable: true,
                writable: true,
            });
        });

        it("treats a read-only data property as readable but not writable", () => {
            expect(Introspection.propertyDescriptorToAccessibility({ value: 1, writable: false })).deep.equal({
                readable: true,
                writable: false,
            });
        });

        it("treats a getter as readable", () => {
            expect(Introspection.propertyDescriptorToAccessibility({ get: () => 1 })).deep.equal({
                readable: true,
                writable: false,
            });
        });

        it("treats a setter-only accessor as writable but not readable", () => {
            expect(Introspection.propertyDescriptorToAccessibility({ set: () => {} })).deep.equal({
                readable: false,
                writable: true,
            });
        });
    });
});
