// BABYLON
import type { IGetSetVerticesData } from "core/Meshes";
import { Constants } from "core/Engines/constants";

// 3MF
import type { FloatArray, IndicesArray, Nullable } from "core/types";
import {
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
import type { I3mfMesh, I3mfMetadata, I3mfObject, I3mfTriangle, I3mfTriangles, I3mfVertex, I3mfVertices, ST_ResourceID, ST_Unit } from "./3mf.interfaces";
import { ST_ObjectType } from "./3mf.interfaces";
import type { Matrix3d } from "./3mf.matrix";

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
    withData(data: IGetSetVerticesData): ThreeMfMeshObjectBuilder {
        this._object.content = this._buildMesh(data);
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
    private _buildMesh(data: IGetSetVerticesData): I3mfMesh {
        const vertices = this._buildVertices(data.getVerticesData(Constants.PositionKind));
        const triangles = this._buildTriangle(data.getIndices());
        return new ThreeMfMesh(vertices, triangles);
    }

    private _buildVertices(p: Nullable<FloatArray>): I3mfVertices {
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

    private _buildTriangle(indice: Nullable<IndicesArray>): I3mfTriangles {
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
