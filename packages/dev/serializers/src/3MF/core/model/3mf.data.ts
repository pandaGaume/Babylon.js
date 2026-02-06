import type { FloatArray, IndicesArray } from "core/types";

/**
 * Interface used to define object data independaly of framework
 */
export interface IVertexData {
    /**
     * An array of the x, y, z position of each vertex  [...., x, y, z, .....]
     */
    positions: FloatArray;
    /**
     * An array of i, j, k the three vertex indices required for each triangular facet  [...., i, j, k .....]
     */
    indices: IndicesArray;
    /**
     * An array of the x, y, z normal vector of each vertex  [...., x, y, z, .....]
     */
    normals?: FloatArray;
    /**
     * An array of the r, g, b, a, color of each vertex  [...., r, g, b, a, .....]
     */
    colors?: FloatArray;
}
