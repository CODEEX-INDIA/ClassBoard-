import { describe, expect, it } from "vitest";
import { denormalizePoint, normalizePoint, rotatePoint } from "../lib/annotations/geometry";
describe("page-relative geometry", () => { it("round trips at arbitrary zoom", () => expect(denormalizePoint(normalizePoint({ x: 250, y: 125 }, { width: 500, height: 250 }), { width: 1000, height: 500 })).toEqual({ x: 500, y: 250 })); it("rotates quarter turns", () => expect(rotatePoint({ x: .2, y: .7 }, 90)).toEqual({ x: .30000000000000004, y: .2 })); });
