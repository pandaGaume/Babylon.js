# 3MF Exporter for Babylon.js

This PR introduces a 3MF exporter designed around Babylon.js rendering concepts: Meshes, SubMeshes, and instances. Since 3MF targets production workflows (slicers and printers), it supports concepts such as components and part numbers that do not exist in Babylon.js. Because of that mismatch, the exporter must make a few pragmatic choices to map Babylon.js content into a valid and useful 3MF package.

The key principle is that the serializer stays predictable and "dumb": it does not guess production intent. Instead, users are expected to define the behaviors they need (metadata, instance export, etc.) before calling the exporter. This is important because 3MF is versatile and downstream consumers (slicers, printers) vary widely in what they support.

Material and color handling can also depend heavily on the target ecosystem. This PR focuses on core geometry and structure first; material and color extensions can be expanded later once we have clearer feedback on real-world compatibility.

## Metadata

You can inject metadata through the serializer options. Metadata entries are defined as name/value pairs. 3MF defines a set of well-known metadata names, including:

- Title: A title for the 3MF document
- Designer: A name for a designer of this document
- Description: A description of the document
- Copyright: A copyright associated with this document
- LicenseTerms: License information associated with this document
- Rating: An industry rating associated with this document
- CreationDate: The date this document was created by a source application
- ModificationDate: The date this document was last modified
- Application: The name of the source application that originally created this document

The exporter does not enforce or restrict these values: you can provide any of the known keys above, as well as any additional metadata your workflow requires.

## SubMeshes

In Babylon.js, a SubMesh splits a single Mesh into smaller ranges so each range can be rendered separately (often with different materials) while still remaining a single Mesh object. Babylon.js also creates a default SubMesh covering the full mesh when none are explicitly defined.

To preserve this structure for production export, the serializer processes SubMeshes and exports each SubMesh as its own 3MF mesh object. Concretely:

- If a Mesh contains N SubMeshes, the exporter writes N 3MF mesh objects.
- This creates a clear mapping where each exported object can later receive its own material and/or color assignment (which is the main reason SubMeshes exist in Babylon.js).

## Instances and Thin Instances

Instances raise two separate cases: standard InstancedMesh objects, and thin instances.

1. InstancedMesh  
   Instanced meshes are explicit objects in the scene graph, so they can be passed directly to the exporter. This is the chosen behavior: users can provide Mesh and InstancedMesh objects to the serializer, and they will be exported accordingly.

2. Thin instances  
   Thin instances are tightly coupled to the source Mesh and do not exist as independent scene objects. To keep the API simple and predictable, thin instances are NOT yest exported

As a general rule, the serializer avoids hidden logic. Any functional rules (selection, grouping, filtering) should be applied before calling it.

## Usage

Inside the `3MF` directory, the `core` folder is fully independent from Babylon.js. It defines the utilities and data model required to build a valid 3MF document/package.

The Babylon.js integration is implemented by `3mfSerializer`, which specializes the abstract serializer for Babylon types, and by a `ThreeMf` helper with small convenience utilities.

### Entry point

The main entry point is:

```ts
public async serializeAsync(
  sink: (err: any, chunk: Uint8Array, final: boolean) => void,
  ...meshes: Array<T>
): Promise<void> { ... }
```

The most important parameter (besides the meshes) is the `sink` function. It receives the binary output as chunks and can forward them to any destination: in-memory buffers, blobs, file streams, or a network transport.

### Convenience helper

A convenience helper is provided to collect the output into memory:

```ts
ThreeMf.SerializeToMemoryAsync<T>(
  s: I3mfSerializer<T>,
  ...meshes: Array<T>
): Promise<Uint8Array | undefined>;
```

For Babylon.js, `T` is `(Mesh | InstancedMesh)`.

### Minimal example

```ts
async function downloadFileImpl(source, filename = "export.3mf") {
  const res = await BABYLON.ThreeMf.SerializeToMemoryAsync(
    new BABYLON.BjsThreeMfSerializer({ exportInstances: true }),
    ...source
  );

  const blob = new Blob([res], { type: "model/3mf" });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
```
