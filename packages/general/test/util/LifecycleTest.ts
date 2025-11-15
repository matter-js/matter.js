/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Lifecycle,
    DependencyLifecycleError,
    UninitializedDependencyError,
    CrashedDependencyError,
    DestroyedDependencyError,
} from "#util/Lifecycle.js";

describe("Lifecycle", () => {
    describe("Status", () => {
        it("defines all lifecycle states", () => {
            expect(Lifecycle.Status.Unknown).equal("unknown");
            expect(Lifecycle.Status.Inactive).equal("inactive");
            expect(Lifecycle.Status.Initializing).equal("initializing");
            expect(Lifecycle.Status.Active).equal("active");
            expect(Lifecycle.Status.Crashed).equal("crashed");
            expect(Lifecycle.Status.Destroying).equal("destroying");
            expect(Lifecycle.Status.Destroyed).equal("destroyed");
        });
    });

    describe("assertActive", () => {
        it("does not throw when status is Active", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Active);
            }).not.throws();
        });

        it("throws UninitializedDependencyError when status is Inactive", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Inactive);
            }).throws(UninitializedDependencyError, "dependency is not initialized");
        });

        it("throws UninitializedDependencyError when status is Initializing", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Initializing);
            }).throws(UninitializedDependencyError, "dependency is still initializing");
        });

        it("throws CrashedDependencyError when status is Crashed", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Crashed);
            }).throws(CrashedDependencyError, "dependency initialization failed");
        });

        it("throws DestroyedDependencyError when status is Destroying", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Destroying);
            }).throws(DestroyedDependencyError, "dependency is closing");
        });

        it("throws DestroyedDependencyError when status is Destroyed", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Destroyed);
            }).throws(DestroyedDependencyError, "dependency is closed");
        });

        it("throws DependencyLifecycleError when status is Unknown", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Unknown);
            }).throws(DependencyLifecycleError, 'dependency status "unknown" is unknown');
        });

        it("uses custom description in error message", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Inactive, "my-service");
            }).throws(UninitializedDependencyError, "my-service is not initialized");
        });

        it("defaults to 'dependency' when no description provided", () => {
            expect(() => {
                Lifecycle.assertActive(Lifecycle.Status.Destroyed);
            }).throws(DestroyedDependencyError, "dependency is closed");
        });
    });

    describe("DependencyLifecycleError", () => {
        it("constructs error with what and why", () => {
            const error = new DependencyLifecycleError("service", "failed to start");

            expect(error.message).equal("service failed to start");
        });

        it("is instance of Error", () => {
            const error = new DependencyLifecycleError("service", "failed");

            expect(error).instanceOf(Error);
        });
    });

    describe("UninitializedDependencyError", () => {
        it("constructs error with what and why", () => {
            const error = new UninitializedDependencyError("service", "is not ready");

            expect(error.message).equal("service is not ready");
        });

        it("is instance of DependencyLifecycleError", () => {
            const error = new UninitializedDependencyError("service", "is not ready");

            expect(error).instanceOf(DependencyLifecycleError);
        });
    });

    describe("CrashedDependencyError", () => {
        it("constructs error with what and why", () => {
            const error = new CrashedDependencyError("service", "has crashed");

            expect(error.message).equal("service has crashed");
        });

        it("is instance of DependencyLifecycleError", () => {
            const error = new CrashedDependencyError("service", "has crashed");

            expect(error).instanceOf(DependencyLifecycleError);
        });

        it("has optional subject property", () => {
            const error = new CrashedDependencyError("service", "has crashed");

            expect(error.subject).undefined;

            const obj = {};
            error.subject = obj;

            expect(error.subject).equal(obj);
        });
    });

    describe("DestroyedDependencyError", () => {
        it("constructs error with what and why", () => {
            const error = new DestroyedDependencyError("service", "is destroyed");

            expect(error.message).equal("service is destroyed");
        });

        it("is instance of DependencyLifecycleError", () => {
            const error = new DestroyedDependencyError("service", "is destroyed");

            expect(error).instanceOf(DependencyLifecycleError);
        });
    });

    describe("Map type", () => {
        it("allows defining status map", () => {
            const statusMap: Lifecycle.Map<"service1" | "service2"> = {
                service1: Lifecycle.Status.Active,
                service2: Lifecycle.Status.Inactive,
            };

            expect(statusMap.service1).equal(Lifecycle.Status.Active);
            expect(statusMap.service2).equal(Lifecycle.Status.Inactive);
        });
    });

    describe("Status transitions", () => {
        it("validates typical lifecycle progression", () => {
            // Typical progression: Inactive -> Initializing -> Active -> Destroying -> Destroyed
            let status = Lifecycle.Status.Inactive;

            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(UninitializedDependencyError);

            status = Lifecycle.Status.Initializing;
            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(UninitializedDependencyError);

            status = Lifecycle.Status.Active;
            expect(() => {
                Lifecycle.assertActive(status);
            }).not.throws();

            status = Lifecycle.Status.Destroying;
            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(DestroyedDependencyError);

            status = Lifecycle.Status.Destroyed;
            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(DestroyedDependencyError);
        });

        it("validates crash scenario", () => {
            // Crash scenario: Inactive -> Initializing -> Crashed
            let status = Lifecycle.Status.Initializing;

            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(UninitializedDependencyError);

            status = Lifecycle.Status.Crashed;
            expect(() => {
                Lifecycle.assertActive(status);
            }).throws(CrashedDependencyError);
        });
    });

    describe("assertActive with multiple statuses", () => {
        it("throws appropriate error for each invalid status", () => {
            const invalidStatuses = [
                { status: Lifecycle.Status.Unknown, errorType: DependencyLifecycleError, message: "unknown" },
                { status: Lifecycle.Status.Inactive, errorType: UninitializedDependencyError, message: "not initialized" },
                { status: Lifecycle.Status.Initializing, errorType: UninitializedDependencyError, message: "still initializing" },
                { status: Lifecycle.Status.Crashed, errorType: CrashedDependencyError, message: "initialization failed" },
                { status: Lifecycle.Status.Destroying, errorType: DestroyedDependencyError, message: "is closing" },
                { status: Lifecycle.Status.Destroyed, errorType: DestroyedDependencyError, message: "is closed" },
            ];

            for (const { status, errorType, message } of invalidStatuses) {
                expect(() => {
                    Lifecycle.assertActive(status, "test-service");
                }).throws(errorType, message);
            }
        });
    });

    describe("error message formatting", () => {
        it("formats error messages consistently", () => {
            const testCases = [
                { status: Lifecycle.Status.Inactive, description: "auth-service", expected: "auth-service is not initialized" },
                { status: Lifecycle.Status.Crashed, description: "database", expected: "database initialization failed" },
                { status: Lifecycle.Status.Destroyed, description: "cache", expected: "cache is closed" },
            ];

            for (const { status, description, expected } of testCases) {
                try {
                    Lifecycle.assertActive(status, description);
                    expect.fail("Should have thrown an error");
                } catch (error: any) {
                    expect(error.message).equal(expected);
                }
            }
        });
    });
});
