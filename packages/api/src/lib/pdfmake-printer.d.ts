declare module "pdfmake/js/Printer" {
  import type { Readable } from "node:stream";

  import type {
    TDocumentDefinitions,
    TFontDictionary,
  } from "pdfmake/interfaces";

  interface PdfKitDocument extends Readable {
    end: () => void;
  }

  export default class PdfPrinter {
    constructor(fontDescriptors: TFontDictionary);
    createPdfKitDocument: (
      docDefinition: TDocumentDefinitions
    ) => PdfKitDocument;
  }
}
