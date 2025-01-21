declare module "mic" {
  interface MicOptions {
    rate?: string;
    channels?: string;
    debug?: boolean;
    fileType?: string;
    exitOnSilence?: number;
    // etc. from mic docs if needed
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
