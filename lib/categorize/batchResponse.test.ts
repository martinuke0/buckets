import { describe, it, expect } from "vitest";
import { mapBatchResponse } from "@/lib/categorize/batchResponse";

const IDS = ["food", "bills"];

describe("mapBatchResponse", () => {
  it("aligns results to the input indices", () => {
    const raw = JSON.stringify([
      { index: 0, bucketId: "food" },
      { index: 1, bucketId: "bills" },
    ]);
    expect(mapBatchResponse(raw, 2, IDS)).toEqual(["food", "bills"]);
  });

  it("maps 'none' and unknown bucketIds to null", () => {
    const raw = JSON.stringify([
      { index: 0, bucketId: "none" },
      { index: 1, bucketId: "not-a-bucket" },
    ]);
    expect(mapBatchResponse(raw, 2, IDS)).toEqual([null, null]);
  });

  it("fills omitted indices with null", () => {
    const raw = JSON.stringify([{ index: 1, bucketId: "food" }]); // index 0 missing
    expect(mapBatchResponse(raw, 2, IDS)).toEqual([null, "food"]);
  });

  it("ignores out-of-range indices without corrupting the array", () => {
    const raw = JSON.stringify([
      { index: 5, bucketId: "food" }, // beyond count
      { index: 0, bucketId: "bills" },
    ]);
    expect(mapBatchResponse(raw, 2, IDS)).toEqual(["bills", null]);
  });

  it("returns all-null for bad JSON, non-array, or empty text", () => {
    expect(mapBatchResponse("not json", 2, IDS)).toEqual([null, null]);
    expect(mapBatchResponse(JSON.stringify({ nope: true }), 2, IDS)).toEqual([null, null]);
    expect(mapBatchResponse(null, 3, IDS)).toEqual([null, null, null]);
  });

  it("handles a zero-length request", () => {
    expect(mapBatchResponse("[]", 0, IDS)).toEqual([]);
  });
});
