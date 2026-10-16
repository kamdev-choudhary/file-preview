/**
 * Declarations for dependency entry points that ship no usable types.
 *
 * Both imports here are deep paths chosen deliberately: the browser build of
 * mammoth, and the ESM build of pdf.js. Neither is covered by its package's
 * own `types` field, so without these the viewers fall back to `any` and the
 * strict checks that justify this migration stop applying to them.
 */

declare module 'pdfjs-dist/build/pdf.mjs' {
  // The deep path is the same code the package's `types` entry describes.
  export * from 'pdfjs-dist';
}

declare module 'mammoth/mammoth.browser.js' {
  /** An image mammoth found while converting, exposed to `imgElement`. */
  export interface MammothImage {
    contentType: string;
    read(encoding: 'base64'): Promise<string>;
  }

  /** A note about something the conversion could not represent faithfully. */
  export interface MammothMessage {
    type: 'warning' | 'error' | string;
    message: string;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export interface MammothOptions {
    convertImage?: unknown;
    styleMap?: string[];
  }

  interface Mammoth {
    convertToHtml(
      input: { arrayBuffer: ArrayBuffer },
      options?: MammothOptions,
    ): Promise<MammothResult>;
    images: {
      imgElement(fn: (image: MammothImage) => Promise<{ src: string }>): unknown;
    };
  }

  const mammoth: Mammoth;
  export default mammoth;
}
