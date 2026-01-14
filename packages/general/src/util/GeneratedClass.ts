/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper function for class generation.
 *
 * This factory does not offer TypeScript types for the resulting class.  You must cast separately.
 */
export function GeneratedClass(options: GeneratedClass.Options) {
    const { base, name, beforeSuper, mixins: extraMixins } = options;

    // Options + any additional mixins defines complete functionality
    const mixins = extraMixins ? [...extraMixins, options] : [options];

    // Create the constructor function
    const klass = createConstructor({
        name: name ?? (base ? `${base.name}$` : "GeneratedClass"),
        base,
        beforeSuper,
        mixins,
    });

    // Configure inheritance and other class aspects not handled by the constructor
    configureClass(klass, base, mixins);

    return klass;
}

export namespace GeneratedClass {
    /**
     * These fields control class behavior.
     */
    export interface Mixin {
        /**
         * A function that performs initialization after instantiation.  "this" will be the object and arguments are the
         * arguments to the constructor.
         */
        initialize?: (...args: any[]) => void;

        /**
         * Instance properties.
         */
        instanceProperties?: object;

        /**
         * Instance properties defined using descriptors.
         */
        instanceDescriptors?: PropertyDescriptorMap;

        /**
         * Static properties.
         */
        staticProperties?: object;

        /**
         * Static properties defined using descriptors.
         */
        staticDescriptors?: PropertyDescriptorMap;
    }

    /**
     * Input to {@link GeneratedClass}.
     */
    export interface Options extends Mixin {
        /**
         * The name of the class.
         */
        name?: string;

        /**
         * The base class, if any.
         */
        base?: new (...args: any) => any;

        /**
         * A preprocessor for arguments.  Derivatives may use this to transform arguments prior to call to super() and
         * initialize().
         */
        beforeSuper?: (...args: any[]) => any[];

        /**
         * Other {@link Mixin} objects in addition to this one.
         */
        mixins?: Mixin[];
    }
}

function createConstructor({ name, base, beforeSuper, mixins }: ConstructorOptions) {
    // We generate this function to execute construction logic based on input options; invoked by the actual constructor
    let construct: ConstructFn;

    // Base constructor
    if (base) {
        construct = function (self, args) {
            return reflectConstruct(base, args, self.constructor as new (...args: unknown[]) => unknown);
        };
    } else {
        construct = function (self) {
            return self;
        };
    }

    // Next apply mixins in order.  We create a specialized function depending on whether the mixin has an initialize
    // function and/or includes instance properties
    if (mixins) {
        for (const { initialize, instanceProperties } of mixins) {
            const before: ConstructFn = construct;
            if (initialize) {
                if (instanceProperties) {
                    // Has initialize + instanceProperties
                    construct = function (self: {}, args: unknown[]) {
                        self = before(self, args);
                        for (const k in instanceProperties) {
                            (self as Record<any, any>)[k] = (instanceProperties as any)[k];
                        }
                        initialize.apply(self, args);
                        return self;
                    };
                } else {
                    // Has initialize
                    construct = function (self: {}, args: unknown[]) {
                        self = before(self, args);
                        initialize.apply(self, args);
                        return self;
                    };
                }
            } else if (instanceProperties) {
                // Has instanceProperties
                construct = function (self: {}, args: unknown[]) {
                    self = before(self, args) as Record<any, any>;
                    for (const k in instanceProperties) {
                        (self as Record<any, any>)[k] = (instanceProperties as any)[k];
                    }
                    return self;
                };
            }
        }
    }

    // This is the actual constructor.
    //
    // We install the function into a named property of a temporary object because the VM will then assign it a name.
    // Otherwise it would be anonymous which is confusing in diagnostics and the debugger
    //
    // The "beforeSuper" function contains logic that would appear before the "super" call in a normal ES6 class.  We
    // generate a different function if present to avoid an extra conditional on every instantiation
    let klass: (...args: unknown[]) => unknown;
    if (beforeSuper) {
        // "beforeSuper" is present; generate a constructor that invokes it before proceeding
        ({ [name]: klass } = {
            [name]: function (...args: unknown[]) {
                // This is mandated for ES6 classes; try to behave the same
                if (!(this instanceof klass)) {
                    throw new TypeError(`Class constructor ${klass.name} cannot be invoked without 'new'`);
                }

                // Apply pre-construction logic
                args = beforeSuper(...args);

                // Actual construction logic
                return construct(this, args);
            },
        });
    } else {
        // Delegate to "construct" function
        ({ [name]: klass } = {
            [name]: function (...args: unknown[]) {
                // See the comment above
                if (!(this instanceof klass)) {
                    throw new TypeError(`Class constructor ${klass.name} cannot be invoked without 'new'`);
                }

                // Actual construction logic
                return construct(this, args);
            },
        });
    }

    // Cast to constructor type
    return klass as unknown as new (...args: unknown[]) => {};
}

function configureClass(
    klass: new (...args: unknown[]) => unknown,
    base: undefined | (new (...args: any[]) => any),
    mixins: GeneratedClass.Mixin[],
) {
    // Configure inheritance for derived classes
    if (base) {
        // Enable static inheritance
        Object.setPrototypeOf(klass, base);

        // Enable instance inheritance
        klass.prototype = Reflect.construct(base, []);
    }

    // Expose the correct constructor for instances via the prototype
    Object.defineProperty(klass.prototype, "constructor", { value: klass });

    // Install properties.  "Own instance" properties we install in the constructor but this handles static properties
    // and those installed on the prototype
    if (mixins) {
        for (const { staticProperties, staticDescriptors, instanceDescriptors } of mixins) {
            if (staticProperties) {
                Object.assign(klass, staticProperties);
            }
            if (staticDescriptors) {
                Object.defineProperties(klass, staticDescriptors);
            }
            if (instanceDescriptors) {
                Object.defineProperties(klass.prototype, instanceDescriptors);
            }
        }
    }
}

/**
 * {@link Reflect.construct} equivalent.
 *
 * On modern VMs this is just {@link Reflect.construct} but we fall back to an ES5 version if necessary.
 */
let reflectConstruct: (
    target: new (...args: unknown[]) => unknown,
    args: unknown[],
    newTarget?: new (...args: unknown[]) => unknown,
) => {};

if (typeof globalThis.Reflect?.construct === "function") {
    reflectConstruct = Reflect.construct;
} else {
    reflectConstruct = (
        target: new (...args: unknown[]) => unknown,
        args: unknown[],
        newTarget?: new (...args: unknown[]) => unknown,
    ) => {
        if (typeof newTarget === "undefined") {
            newTarget = target;
        }

        const initialThis = Object.create(newTarget.prototype);
        const constructorResult = target.apply(initialThis, args);
        if (
            (typeof constructorResult === "object" && constructorResult !== null) ||
            typeof constructorResult === "function"
        ) {
            return constructorResult;
        }

        return initialThis;
    };
}

interface ConstructorOptions {
    name: string;
    base?: new (...args: any[]) => any;
    beforeSuper?: (...args: any[]) => any[];
    mixins: GeneratedClass.Mixin[];
}

type ConstructFn = (self: {}, args: unknown[]) => {};
