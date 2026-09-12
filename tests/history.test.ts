import { describe, expect, it } from "vitest";
import { commit, initialHistory, redo, undo } from "../lib/annotations/history";
describe("annotation history", () => { it("undoes and redoes deterministically", () => { const first = [{ id: "a" }] as never[]; const state = commit(initialHistory(), first); expect(undo(state).present).toEqual([]); expect(redo(undo(state)).present).toEqual(first); }); });
