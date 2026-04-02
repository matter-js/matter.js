# @matter/model - Matter Object Model

This folder contains an object model that captures Matter semantics as precisely as possible. It also includes support
logic related to model manipulation and runtime validation.

Other representations of the Matter data model in matter.js offer similar representations with a different focus. The
TLV models data with a focus on serialization and manipulation of instance values. The Cluster API models clusters in
an operational form and in fact is partially generated from this model.

All references to _Matter specification_ in the object model corpus refer collectively to [Matter 1.3 Core
Specification](https://csa-iot.org/developer-resource/specifications-download-request/), [Matter 1.3 Application Cluster
Specification](https://csa-iot.org/developer-resource/specifications-download-request/), and [Matter 1.3 Device Library
Specification](https://csa-iot.org/developer-resource/specifications-download-request/).

## Code structure

Subfolders support specific functions:

- [elements/](src/elements) - types describing the data model
- [models/](src/models) - classes implementing an operational version of the data model
- [standard/](src/standard) - the full data model defined by the Matter Specification
- [aspects/](src/aspects) - parsers and ASTs for fields that utilize domain specific languages
- [logic/](src/logic) - various algorithms that operate on models

The datatypes in [elements](src/elements) model Matter elements using TypeScript types. _Elements_ are a formal
component of the Matter specification that describe individual structures in the data model. Our element definitions are
subtypes of [BaseElement](src/elements/BaseElement.ts).

For each element definition, a class in [models](src/models) offers a concrete operational implementation. This is the
API to use if you need to work with the data model beyond simple data modeling. Our models are all subtypes of
[Model](src/models/Model.ts).

For a richer model you can load `@matter/model/resources`. This package installs additional human-facing details for
data elements, such as long-form descriptions and cross references. These fields will be `undefined` in the model if
you do not load the resources module.

[MatterModel](src/models/MatterModel.ts) is the primary entrypoint to the API.

## Usage

Obtain a working instance of the model:

```ts
import { Matter } from "@matter/model";
```

Retrieve standard definitions from the model.  Indices are callable:

```ts
const OnOffCluster = Matter.clusters("OnOff");
const uint8 = Matter.datatypes("uint8");
```

Iterate over attributes of a cluster:

```ts
for (const attribute of OnOffCluster.attributes) {
    // Do something
}
```

Use `propertyName` to get the camelCase JS property key:

```ts
const name = attribute.propertyName; // e.g. "onOff" for "OnOff"
```

## Implementation

The base model includes [global datatypes](src/models/Globals.ts) defined by the Matter specification. We generate other
elements of the [standard model](src/standard/MatterDefinition.ts) by merging models in the
[top-level models package](../../support/models/README.md).

To recreate the standard model files:

```sh
cd matter.js/support/codegen
npm run generate-model
```

### Spec data model

Input model _[spec.ts](../../support/models/src/v1.4.1/spec.ts)_ is the data model defined by the Matter specification.

We generate [spec.ts](../../support/models/src/v1.4.1/spec.ts) from the Matter specification documents. This ensures our
definitions align with the specification and gives us detailed information unavailable elsewhere.

The spec generator is [generate-spec.ts](../../support/codegen/src/generate-spec.ts).
To run:

```sh
cd matter.js/support/codegen
npm run generate-spec
```

The generator supports two input formats:

- **HTML** — the original format, generated from the same Asciidoctor sources as the published PDFs
- **Markdown** — a newer machine-generated markdown version of the specification

The format is detected automatically from the `--path` argument. A directory containing subdirectories
with `_index.md` files (`main/`, `appclusters/`, `device_library/`, `standard_namespaces/`) is treated
as a markdown spec tree. A directory containing `.html` files is treated as the HTML spec. Examples:

```sh
npm run generate-spec -- --path ~/matter-spec/1.5.1/html
npm run generate-spec -- --path ~/matter-spec/1.5.1/markdown
```

You can also set the `MATTER_SPECIFICATION_PATH` environment variable or omit `--path` to use the
default location (`~/Dropbox/matter/<version>`).

Details we extract from the specification include standard element names, types and detailed documentation including
cross references to specification documents. We also extract DSL-based definitions of Matter concepts such as
conformance, constraints, etc.

### Local data model

Input model _[local.ts](../../support/models/src/local.ts)_ defines elements that are unavailable (or incorrect) in the
other models. This partial model is the result of editorial decisions by matter.js contributors.

### CHIP data model

Model [chip.ts](../../support/models/src/v1.1/chip.ts) is the CHIP data model. _CHIP_ is [Project CHIP's connectedhomeip
repository](https://github.com/project-chip/connectedhomeip/). Originally this was the most robust
open-source programmatic definition of Matter elements.

We generate [chip.ts](../../support/models/src/v1.1/chip.ts) from
[CHIP definitions](https://github.com/project-chip/connectedhomeip/tree/master/src/app/zap-templates/zcl/data-model). This
ensures our definitions align with CHIP's.

The CHIP generator is [generate-chip](../../support/codegen/src/generate-chip.ts). To run:

```sh
cd matter.js/support/codegen
npm run generate-chip
```

We still include the CHIP generator and model in our repository but no longer use it as input for the matter.js model.

### Standard (final) data model

Unlike above data models, the _standard data model_ in [src/model/standard](./src/standard) is part of the matter.js public
API. This represents our best attempt at a complete Matter data model.

[generate-model.ts](../../support/codegen/src/generate-model.ts) creates this model by analyzing and combining elements from
the models above.

To update the standard model:

```sh
cd matter.js/support/codegen
npm run generate-model
```

## Cluster generation

One of the ways we use the Matter Object Model is to generate cluster
implementations.

The cluster generator is [generate-cluster.ts](../../support/codegen/src/generate-clusters.ts).
To run:

```sh
cd matter.js/support/codegen
npm run generate
```

Note that this will rebuild the model (above) and the clusters. If you know the model is unchanged you can also just
generate the clusters:

```sh
cd matter.js/support/codegen
npm run generate-clusters
```

This is generally only useful if you are modifying the cluster generation code or if you have already generated the
model.

## Ensuring correctness

Many of the scripts mentioned above generate models. It is important that these models are accurate.

To this end, there is extensive validation that every generator runs before output. Validation prints detailed
information about the state of every element in the model.

Each validation error is associated with an error code. If there are errors, a summary of the errors is printed at the
end of validation.

The final model is also validated during testing by [MatterTest](test/MatterTest.ts).

Automatic validation can't find every semantic error but it does ensure the resulting model is functional.
