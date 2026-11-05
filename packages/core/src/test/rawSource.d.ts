/** Vite's `?raw` import: the source text of a file, which the tests compare with what the generator renders. */
declare module "*?raw" {
  const source: string;
  export default source;
}
