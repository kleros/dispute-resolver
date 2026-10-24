import { describe, expect, it } from "vitest";
import { urlPieces } from "./urlPieces";

describe("urlPieces", () => {
  it("lists the host, credentials, path segments and query values of six characters or more, longest first", () => {
    expect(urlPieces("https://operator:hunter22@rpc.example/v2/abc123SECRETxyz?apikey=query-secret&n=1")).toEqual([
      "abc123SECRETxyz",
      "query-secret",
      "rpc.example",
      "operator",
      "hunter22",
    ]);
  });

  it("lists a piece written percent-encoded in its decoded spelling too, since an RPC can repeat either", () => {
    expect(urlPieces("https://rpc.example/v2/key%2Bwith%3Dsigns")).toEqual(expect.arrayContaining(["key%2Bwith%3Dsigns", "key+with=signs"]));
  });

  it("keeps a query value that holds an equals sign whole", () => {
    expect(urlPieces("https://rpc.example/?token=abc123==")).toContain("abc123==");
  });

  it("a URL that does not parse is its own piece", () => {
    expect(urlPieces("not a url at all")).toEqual(["not a url at all"]);
  });

  it("a malformed percent sequence is kept as written", () => {
    expect(urlPieces("https://rpc.example/v2/broken%E0%A4%A")).toEqual(["broken%E0%A4%A", "rpc.example"]);
  });
});
