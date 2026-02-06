import type { I3mfRGBAColor } from "./3mf.types";

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

/**
 *
 * @param c
 * @returns
 */
export function RgbaToHex(c: I3mfRGBAColor | { r: number; g: number; b: number; a?: number }): string {
    const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const toHex2 = (v: number) => clampByte(v).toString(16).padStart(2, "0").toUpperCase();

    const r = toHex2(c.r);
    const g = toHex2(c.g);
    const b = toHex2(c.b);

    if (typeof (c as any).a === "number") {
        const aVal = (c as any).a as number;
        const aByte = aVal <= 1 ? clampByte(aVal * 255) : clampByte(aVal);
        return `#${r}${g}${b}${toHex2(aByte)}`;
    }

    return `#${r}${g}${b}`;
}
