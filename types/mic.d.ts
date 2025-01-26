//module.exports attempt to export type
declare module "mic" {
  interface MicOptions {
    rate?: string;
    channels?: string;
    debug?: boolean;
    fileType?: string;
    exitOnSilence?: number;
    // etc. from mic docs if needed
    thresholdStart: number; // dB or raw amplitude level
    thresholdStop: number;
  }

  interface MicInstance {
    start(): void;
    stop(): void;
    pause?: () => void;
    resume?: () => void;
    getAudioStream(): NodeJS.ReadableStream;
    // add more if needed
  }

  export default function mic(options?: MicOptions): MicInstance;
}

// CommonJS format for type:
// types/mic.d.ts
// declare module "mic" {
//   interface MicOptions {
//     rate?: string;
//     channels?: string;
//     debug?: boolean;
//     fileType?: string;
//     exitOnSilence?: number;
//     // etc, from mic docs
//   }

//   interface MicInstance {
//     start(): void;
//     stop(): void;
//     pause?: () => void;
//     resume?: () => void;
//     getAudioStream(): NodeJS.ReadableStream;
//   }

//   // Because mic uses `module.exports = function mic()...`,
//   // We represent that as export = ...
//   function mic(options?: MicOptions): MicInstance;
//   export = mic;
// }
