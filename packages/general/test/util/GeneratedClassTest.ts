/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneratedClass } from "#util/GeneratedClass.js";

describe("GeneratedClass", () => {
    it("names classes correctly", () => {
        expect(GeneratedClass({}).name).equals("GeneratedClass");

        const Foo = GeneratedClass({ name: "Foo" });
        expect(Foo.name).equals("Foo");

        expect(GeneratedClass({ base: Foo }).name).equals("Foo$");
    });

    it("sets static property", () => {
        expect((GeneratedClass({ staticProperties: { foo: "bar" } }) as any).foo).equals("bar");
    });

    it("sets static descriptor", () => {
        expect((GeneratedClass({ staticDescriptors: { foo: { value: "bar" } } }) as any).foo).equals("bar");
    });

    it("inherits static property", () => {
        const Base = GeneratedClass({ staticProperties: { foo: "bar" } });
        expect((GeneratedClass({ base: Base }) as any).foo).equals("bar");
    });

    it("inherits static descriptor", () => {
        const Base = GeneratedClass({ staticDescriptors: { foo: { value: "bar" } } });
        expect((GeneratedClass({ base: Base }) as any).foo).equals("bar");
    });

    it("instantiates as instanceof", () => {
        const Klass = GeneratedClass({});
        const instance = new Klass();
        expect(instance.constructor).equals(Klass);
        expect(instance).instanceof(Klass);
    });

    it("requires new", () => {
        const Klass = GeneratedClass({});
        expect(() => (Klass as any)()).throws();
    });

    it("instantiates as instanceof base", () => {
        class Base {}
        const Klass = GeneratedClass({ base: Base });
        const instance = new Klass();
        expect(instance.constructor).equals(Klass);
        expect(instance) instanceof Klass;
        expect(instance) instanceof Base;
    });

    it("sets instance property", () => {
        const instance = new (GeneratedClass({ instanceProperties: { foo: "bar" } }))() as any;
        expect(instance.foo).equals("bar");
    });

    it("sets instance descriptor", () => {
        const instance = new (GeneratedClass({ instanceDescriptors: { foo: { value: "bar" } } }))() as any;
        expect(instance.foo).equals("bar");
    });

    it("inherits instance property", () => {
        const Base = GeneratedClass({ instanceProperties: { foo: "bar" } });
        const instance = new (GeneratedClass({ base: Base }))() as any;
        expect(instance.foo).equals("bar");
    });

    it("inherits instance descriptor", () => {
        const Base = GeneratedClass({ instanceDescriptors: { foo: { value: "bar" } } });
        const instance = new (GeneratedClass({ base: Base }))() as any;
        expect(instance.foo).equals("bar");
    });

    it("initializes", () => {
        const klass = GeneratedClass({
            initialize(this: { foo: string }, input: string) {
                this.foo = input.toUpperCase();
            },
        });

        const instance = new klass("hello") as any;
        expect(instance.foo).equals("HELLO");
    });

    it("preprocesses arguments", () => {
        const klass = GeneratedClass({
            base: class {
                foo;

                constructor(foo: string) {
                    this.foo = foo;
                }
            },

            beforeSuper(foo: string) {
                return [foo.toUpperCase()];
            },
        });

        const instance = new klass("bar") as any;
        expect(instance.foo).equals("BAR");
    });

    function expectBizesAndBazes(...types: Array<new () => any>) {
        const Type = types[0];
        const instance = new Type();

        for (let i = 0; i < types.length; i++) {
            const index = i + 1;
            expect(instance).instanceof(types[i]);
            expect(`foo${index}` in instance).ok;
            expect(instance[`foo${index}`]).equals(`bar${index}`);
            expect((Type as any)[`biz${index}`]).equals(`baz${index}`);
            i++;
        }
    }

    it("extends ES6 class", () => {
        class Es6 {
            foo1 = "bar1";
            static biz1 = "baz1";
        }

        const Derived = GeneratedClass({
            name: "Derived",
            base: Es6,

            instanceProperties: { foo2: "bar2" },
            staticProperties: { biz2: "baz2" },
        });

        expectBizesAndBazes(Derived, Es6);
    });

    it("is extensible by ES6 class", () => {
        const Generated = GeneratedClass({
            name: "Generated",
            instanceProperties: { foo1: "bar1" },
            staticProperties: { biz1: "baz1" },
        });

        class Es6 extends Generated {
            foo2 = "bar2";
            static biz2 = "baz2";
        }

        expectBizesAndBazes(Es6, Generated);
    });

    it("extension of ES6 class is extensible by ES6 class", () => {
        class Base {
            foo1 = "bar1";
            static biz1 = "baz1";
        }

        const FirstDerivative = GeneratedClass({
            name: "FirstDerivative",
            base: Base,

            instanceProperties: { foo2: "bar2" },
            staticProperties: { biz2: "baz2" },
        });

        class SecondDerivative extends FirstDerivative {
            foo3 = "bar3";
            static biz3 = "baz3";
        }

        expectBizesAndBazes(SecondDerivative, FirstDerivative, Base);
    });
});
