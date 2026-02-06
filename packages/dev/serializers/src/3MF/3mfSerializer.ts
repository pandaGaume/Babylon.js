// Babylonjs
import type { Mesh, SubMesh } from "core/Meshes";
import { InstancedMesh } from "core/Meshes/instancedMesh";
import { VertexBuffer } from "core/Buffers/buffer";

// 3MF
import { IncrementalIdFactory } from "./core/model/3mf.utils";
import { ThreeMfComponentsBuilder, ThreeMfDocumentBuilder, ThreeMfMeshBuilder, ThreeMfModelBuilder } from "./core/model/3mf.builder";
import type { I3mfDocument, I3mfObject, I3mfVertex, I3mfVertexData } from "./core/model";
import { Matrix3d } from "./core/model/3mf.math";
import { Matrix } from "core/Maths/math";

/**
 *
 */
export interface IThreeMfSerializerOptions {
    /**  */
    exportInstances: boolean;
    /**  */
    exportSubmeshes: boolean;
}

/**
 *
 */
export class ThreeMfSerializer {
    /**
     *
     */
    static DEFAULT_3MF_EXPORTER_OPTIONS: IThreeMfSerializerOptions = {
        exportInstances: false,
        exportSubmeshes: false,
    };

    private _o: IThreeMfSerializerOptions;
    /**
     *
     * @param opts
     */
    public constructor(opts: Partial<IThreeMfSerializerOptions> = {}) {
        this._o = { ...ThreeMfSerializer.DEFAULT_3MF_EXPORTER_OPTIONS, ...opts };
    }

    /**
     *
     */
    public get options(): Readonly<IThreeMfSerializerOptions> {
        return this._o;
    }

    /**
     *
     * @param meshes
     * @returns
     */
    public toDocument(meshes: Array<Mesh | InstancedMesh>): I3mfDocument | undefined {
        const idFactory = new IncrementalIdFactory();

        const modelBuilder = new ThreeMfModelBuilder();
        const index = new Map<Mesh | SubMesh, I3mfObject>();

        // first pass to build every model from mesh - keep it simple
        const instances: Array<InstancedMesh> | null = this._o.exportInstances ? [] : null;

        for (let j = 0; j < meshes.length; j++) {
            const babylonMesh = meshes[j];
            if (babylonMesh instanceof InstancedMesh) {
                instances?.push(<InstancedMesh>babylonMesh);
                continue;
            }

            const objectName = babylonMesh.name || `mesh${j}`;
            const subMeshes = babylonMesh.subMeshes;
            // into 3MF Submeshes are important because they may carry color information...
            if (this._o.exportSubmeshes && subMeshes && subMeshes.length > 0) {
                for (let k = 0; k < subMeshes.length; k++) {
                    const subMesh = subMeshes[k];
                    const data = this._extractSubMesh(babylonMesh, subMesh);
                    if (data) {
                        const submeshName = `${objectName}_${k}`;
                        const object = new ThreeMfMeshBuilder(idFactory.next())
                            .withPostProcessHandlers(this._handleBjsTo3mfVertexTransform)
                            .withData(data)
                            .withName(submeshName)
                            .build();
                        modelBuilder.withMesh(object);
                        index.set(subMesh, object);
                    }
                }
            } else {
                const data = {
                    positions: babylonMesh.getVerticesData(VertexBuffer.PositionKind) || [],
                    indices: babylonMesh.getIndices() || [],
                };
                const object = new ThreeMfMeshBuilder(idFactory.next()).withPostProcessHandlers(this._handleBjsTo3mfVertexTransform).withData(data).withName(objectName).build();
                modelBuilder.withMesh(object);
                index.set(babylonMesh, object);
            }
        }

        // second pass to instances - the reason is the instance will be saved as 3MF Component with a transformation associed
        // if we export the sub meshes, then we have to add an object per submesh, while the submeshes are exported as whole object
        if (instances && instances.length) {
            // group the instance per mesh, then the xml will be more readable with a Components container per mesh.
            const grouped = this._groupBy(instances, (i) => i.sourceMesh);

            for (const [_babylonMesh, _instances] of Array.from(grouped.entries())) {
                if (_instances && _instances.length) {
                    const cb = new ThreeMfComponentsBuilder(idFactory.next());

                    for (let j = 0; j < _instances.length; j++) {
                        const mesh = _instances[j];
                        const worldTransform = mesh.getWorldMatrix();

                        // process sub meshes
                        const subMeshes = _babylonMesh.subMeshes;
                        if (this._o.exportSubmeshes && subMeshes && subMeshes.length > 0) {
                            for (let k = 0; k < subMeshes.length; k++) {
                                const subMesh = subMeshes[k];

                                // we may speed up the search using a cache to the lastest mesh/object pair
                                const objectRef = index.get(subMesh);

                                if (objectRef) {
                                    // we build a single component
                                    cb.withComponent(objectRef.id, this._handleBjsTo3mfMatrixTransformToRef(worldTransform, Matrix3d.Zero()));
                                    continue;
                                }
                            }
                            continue;
                        }

                        const objectRef = index.get(_babylonMesh);
                        if (objectRef) {
                            // we build a single component
                            cb.withComponent(objectRef.id, this._handleBjsTo3mfMatrixTransformToRef(worldTransform, Matrix3d.Zero()));
                            continue;
                        }
                    }
                    // we a=dd the container.
                    modelBuilder.withComponents(cb);
                }
            }
        }

        const docBuilder = new ThreeMfDocumentBuilder().withModel(modelBuilder);

        return docBuilder.build();
    }

    private _extractSubMesh(mesh: Mesh, sm: SubMesh): I3mfVertexData | undefined {
        const allInd = mesh.getIndices();
        if (!allInd) {
            return undefined;
        }

        const allPos = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!allPos) {
            return undefined;
        }
        if (sm.indexStart == 0 && sm.indexCount == allInd.length) {
            return {
                positions: allPos,
                indices: allInd,
            };
        }
        const indStart = sm.indexStart;

        const map = new Map<number, number>(); // oldIndex -> newIndex
        const newPositions: number[] = [];
        const newIndices = new Uint32Array(sm.indexCount);

        for (let i = 0; i < sm.indexCount; i++) {
            const oldVi = allInd[indStart + i];

            let newVi = map.get(oldVi);
            if (newVi === undefined) {
                newVi = map.size;
                map.set(oldVi, newVi);

                const p = oldVi * 3;
                newPositions.push(allPos[p], allPos[p + 1], allPos[p + 2]);
            }

            newIndices[i] = newVi;
        }

        return {
            positions: new Float32Array(newPositions),
            indices: newIndices,
        };
    }

    private _groupBy<T, K>(items: readonly T[], key: (v: T) => K): Map<K, T[]> {
        const m = new Map<K, T[]>();
        for (const it of items) {
            const k = key(it);
            const arr = m.get(k);
            if (arr) {
                arr.push(it);
            } else {
                m.set(k, [it]);
            }
        }
        return m;
    }

    private _handleBjsTo3mfVertexTransform(v: I3mfVertex): I3mfVertex {
        // basycally a Math.PI / 2 rot arround X
        const tmp = v.y;
        v.y = -v.z;
        v.z = tmp;
        return v;
    }

    private static readonly _R_BJS_TO_3MF = Matrix.RotationX(Math.PI / 2);

    private _handleBjsTo3mfMatrixTransformToRef(tBjs: Matrix, ref: Matrix3d): Matrix3d {
        const tmp = ThreeMfSerializer._R_BJS_TO_3MF.multiplyToRef(tBjs, Matrix.Zero()).transpose();
        const a = tmp.m;
        // a is still Babylon storage, but now the semantic rows/cols match 3MF expectation.
        // 3MF order: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32
        ref.values = [a[0], a[4], a[8], a[1], a[5], a[9], a[2], a[6], a[10], a[3], a[7], a[11]];
        return ref;
    }
}
