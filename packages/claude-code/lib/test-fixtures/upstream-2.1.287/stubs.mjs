// Minimal local substitutes for bunfs-only imports used by chunk-8h7qs60z.mjs.
// Local fixture payload sha256 (after this four-line header): 1dcde8194b23f8b935019598710da16c8ef1efa80c59fb386a001ed575562328
// Runtime substitutes for bunfs-only imports.
// Payload hash covers this file after this header.
// ---- payload ----
export const uze = 210000;
export const k = (error) => error?.code || error?.errno;
export class Rt { constructor(fn) { this.fn = fn; } of(value) { return this.fn(); } }
export const B = () => ({ uuid: Math.random().toString(36).slice(2) });
export const Od = (fn) => fn(B());
export class hd { constructor(opts) { this.max = opts?.max || 1000; this.cache = new Map(); } }
export const Pg = () => new Promise((resolve) => setImmediate(resolve));
