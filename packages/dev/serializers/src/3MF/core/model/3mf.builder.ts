// 3MF
import {
    ThreeMfBase,
    ThreeMfBaseMaterials,
    ThreeMfBuild,
    ThreeMfItem,
    ThreeMfMesh,
    ThreeMfMeta,
    ThreeMfModel,
    ThreeMfObject,
    ThreeMfResources,
    ThreeMfTriangle,
    ThreeMfTriangles,
    ThreeMfVertex,
    ThreeMfVertices,
} from "./3mf";
import type { I3mfBaseMaterials, I3mfMesh, I3mfMetadata, I3mfObject, I3mfTriangle, I3mfTriangles, I3mfVertex, I3mfVertices, ST_ResourceID, ST_Unit } from "./3mf.interfaces";
import { ST_ObjectType } from "./3mf.interfaces";
import { RgbaToHex } from "./3mf.math";
import type { Matrix3d } from "./3mf.math";
import type { I3mfRGBAColor, I3mfVertexData, ThreeMfFloatArray, ThreeMfIndicesArray } from "./3mf.types";

export type VertexHandler = (vertex: I3mfVertex) => I3mfVertex;
export type TriangleHandler = (triangle: I3mfTriangle) => I3mfTriangle;

/**
 *
 */
export class ThreeMfMeshObjectBuilder {
    /**
     *
     */
    _vh?: VertexHandler;
    /**
     *
     */
    _th?: TriangleHandler;

    /**
     *
     */
    _object: ThreeMfObject;

    /**
     *
     * @param id
     * @param type
     */
    public constructor(id: ST_ResourceID, type: ST_ObjectType = ST_ObjectType.model) {
        this._object = new ThreeMfObject(id, type);
    }

    /**
     *
     * @param vertex
     * @param triangle
     * @returns
     */
    public withPostProcessHandlers(vertex: VertexHandler, triangle: TriangleHandler): ThreeMfMeshObjectBuilder {
        this._vh = vertex;
        this._th = triangle;
        return this;
    }

    /**
     *
     * @param data
     * @returns
     */
    withData(data: I3mfVertexData): ThreeMfMeshObjectBuilder {
        this._object.content = this._buildMesh(data);
        return this;
    }

    /**
     *
     * @param id
     * @param i
     * @returns
     */
    withMaterial(id: ST_ResourceID, i: number): ThreeMfMeshObjectBuilder {
        this._object.pid = id;
        this._object.pindex = i;
        return this;
    }

    /**
     *
     * @returns
     */
    public build(): I3mfObject {
        return this._object;
    }

    /**
     *
     * @param id
     * @param type
     */
    public reset(id: ST_ResourceID, type: ST_ObjectType) {
        this._object = new ThreeMfObject(id, type);
    }

    /**
     *
     * @param data
     * @returns
     */
    private _buildMesh(data: I3mfVertexData): I3mfMesh {
        const vertices = this._buildVertices(data.positions);
        const triangles = this._buildTriangle(data.indices);
        return new ThreeMfMesh(vertices, triangles);
    }

    private _buildVertices(p: ThreeMfFloatArray): I3mfVertices {
        const container = new ThreeMfVertices();
        if (p) {
            for (let i = 0; i < p.length; ) {
                const x = p[i++];
                const y = p[i++];
                const z = p[i++];
                let v = new ThreeMfVertex(x, y, z);
                // might be optimized....
                if (this._vh) {
                    v = this._vh(v);
                }
                container.vertex.push(v);
            }
        }
        return container;
    }

    private _buildTriangle(indice: ThreeMfIndicesArray): I3mfTriangles {
        const container = new ThreeMfTriangles();
        if (indice) {
            for (let i = 0; i < indice.length; ) {
                const a = indice[i++];
                const b = indice[i++];
                const c = indice[i++];
                let t = new ThreeMfTriangle(a, b, c);
                // might be optimized....
                if (this._th) {
                    t = this._th(t);
                }
                container.triangle.push(t);
            }
        }
        return container;
    }
}

/**
 *
 */
export class ThreeMfMaterialBuilder {
    private _m: I3mfBaseMaterials;

    public constructor(id: ST_ResourceID) {
        this._m = new ThreeMfBaseMaterials(id);
    }

    /**
     *
     * @param name
     * @param color
     * @returns
     */
    public withColor(name: string, color: I3mfRGBAColor): ThreeMfMaterialBuilder {
        this._m.base = this._m.base ?? [];
        let m = this._m.base.find((m) => m.name.toLowerCase() === name.toLowerCase());
        if (m) {
            m.displaycolor = RgbaToHex(color);
            return this;
        }
        m = new ThreeMfBase(name, RgbaToHex(color));
        this._m.base.push(m);
        return this;
    }

    /**
     *
     * @returns
     */
    public build(): I3mfBaseMaterials {
        return this._m;
    }
}

/**
 *
 */
export class ThreeMfModelBuilder {
    /**
     *
     */
    static KnownMetaSet = new Set(ThreeMfModel.KnownMeta.map((m) => m.toLowerCase()));

    /**
     *
     */
    _model: ThreeMfModel = new ThreeMfModel();
    /**
     *
     */
    _objects = new Map<string, I3mfObject>();

    /**
     *
     * @param name
     * @param value
     * @param preserve
     * @param type
     * @returns
     */
    public withMetaData(name: string, value: string, preserve?: boolean, type?: string): ThreeMfModelBuilder {
        if (!this._model.metadata) {
            // lazzy
            this._model.metadata = new Array<I3mfMetadata>();
        }
        //const isKnownMeta = (s: string): boolean => TMFBuilder.knownMetaSet.has(s.toLowerCase());
        //const qn:IQName = xmlNameToParts(name);
        this._model.metadata.push(new ThreeMfMeta(name, value, preserve, type));
        return this;
    }

    /**
     *
     * @param material
     * @returns
     */
    public withMaterial(material: I3mfBaseMaterials | ThreeMfMaterialBuilder): ThreeMfModelBuilder {
        if (material instanceof ThreeMfMaterialBuilder) {
            material = material.build();
        }
        if (material) {
            this._model.resources = this._model.resources ?? new ThreeMfResources();
            this._model.resources.basematerials = this._model.resources.basematerials ?? [];
            this._model.resources.basematerials.push(material);
        }
        return this;
    }

    /**
     *
     * @param object
     * @returns
     */
    public withMesh(object: I3mfObject | ThreeMfMeshObjectBuilder): ThreeMfModelBuilder {
        if (object instanceof ThreeMfMeshObjectBuilder) {
            object = object.build();
        }
        this._model.resources = this._model.resources ?? new ThreeMfResources();
        this._model.resources.object.push(object);
        return this;
    }

    /**
     *
     * @param objectid
     * @param transform
     * @param partnumber
     * @returns
     */
    public withBuild(objectid: ST_ResourceID, transform?: Matrix3d, partnumber?: string): ThreeMfModelBuilder {
        this._model.build = this._model.build ?? new ThreeMfBuild();
        this._model.build.item?.push(new ThreeMfItem(objectid, transform, partnumber));
        return this;
    }

    /**
     *
     * @param unit
     * @returns
     */
    public withUnit(unit: ST_Unit): ThreeMfModelBuilder {
        this._model.unit = unit;
        return this;
    }

    /**
     *
     * @returns
     */
    public reset(): ThreeMfModelBuilder {
        this._model = new ThreeMfModel();
        this._objects = new Map<string, I3mfObject>();
        return this;
    }

    /**
     *
     * @returns
     */
    public build(): ThreeMfModel {
        // quick surface check..
        if (!this._model.resources?.object?.length) {
            throw new Error("Invalid state: resources MUST be defined ");
        }
        if (!this._model.build?.item?.length) {
            throw new Error("Invalid state: Build MUST be defined ");
        }
        return this._model;
    }
}
