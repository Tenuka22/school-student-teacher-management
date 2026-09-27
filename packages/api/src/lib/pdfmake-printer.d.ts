// Hand-written declaration for pdfmake 0.3's server-side Printer subpath
// (URLResolver / virtual-fs live in pdfmake-url-resolver.d.ts).

declare module "pdfmake/js/Printer" {
  import type { Readable } from "node:stream";

  import type {
    TDocumentDefinitions,
    TFontDictionary,
  } from "pdfmake/interfaces";
  import type URLResolver from "pdfmake/js/URLResolver";
  import type { VirtualFileSystem } from "pdfmake/js/virtual-fs";

  interface PdfKitDocument extends Readable {
    end: () => void;
  }

  export default class PdfPrinter {
    constructor(
      fontDescriptors: TFontDictionary,
      virtualfs: VirtualFileSystem,
      urlResolver: URLResolver,
      localAccessPolicy?: (path: string) => boolean
    );
    createPdfKitDocument: (
      docDefinition: TDocumentDefinitions
    ) => Promise<PdfKitDocument>;
  }
}
