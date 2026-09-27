// Hand-written declarations for the pdfmake 0.3 server-side subpaths;
// @types/pdfmake only covers the top-level entry.

declare module "pdfmake/js/virtual-fs" {
  export interface VirtualFileSystem {
    existsSync: (filename: string) => boolean;
    readFileSync: (filename: string) => Buffer;
    writeFileSync: (filename: string, content: Buffer | string) => void;
  }

  const virtualfs: VirtualFileSystem;
  export default virtualfs;
}

declare module "pdfmake/js/URLResolver" {
  import type { VirtualFileSystem } from "pdfmake/js/virtual-fs";

  export default class URLResolver {
    constructor(fs: VirtualFileSystem);
    setUrlAccessPolicy: (callback: (url: string) => boolean) => void;
  }
}
