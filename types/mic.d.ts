// declare module "mic" {
//   // Fill in with actual types if you can glean them
//   export default function mic(options?: any): any;
// }

declare module "mic" {
  interface MicOptions {
    rate?: string;
    channels?: string;
    debug?: boolean;
    fileType?: string;
    // add any other options you need
  }

  interface MicInstance {
    start(): void;
    stop(): void;
    getAudioStream(): NodeJS.ReadableStream;
    // etc, as needed
  }

  export default function mic(options?: MicOptions): MicInstance;
}
