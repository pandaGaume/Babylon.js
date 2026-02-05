/* eslint-disable @typescript-eslint/naming-convention */

/**
 * In the XSD, ST_Matrix3D is a whitespace separated list of numbers.
 * The official 3MF core spec uses a 3x4 matrix (12 numbers).
 */
export type ST_Matrix3D = [number, number, number, number, number, number, number, number, number, number, number, number];

/**
 *
 */
export class Matrix3d {
    /**
     *
     * @returns
     */
    public static Identity() {
        return new Matrix3d([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    }

    /**
     *
     * @param tx
     * @param ty
     * @param tz
     * @returns
     */
    public static Translate(tx: number, ty: number, tz: number) {
        return new Matrix3d([1, 0, 0, 0, 1, 0, 0, 0, 1, tx, ty, tz]);
    }

    /**
     *
     * @param values
     */
    public constructor(public values: ST_Matrix3D) {}

    /**
     *
     * @returns
     */
    public toString(): string {
        return this.values.join(" ");
    }
}
