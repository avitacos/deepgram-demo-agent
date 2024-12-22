// src/getTranscript.ts
import { Deepgram } from "@deepgram/sdk";
import { TranscriptCollector } from "./TranscriptCollector";
import { spawn } from "child_process";
import Mic from "mic";

const deepgramApiKey = process.env.DEEPGRAM_API_KEY || "";

interface GetTranscriptCallback {
  (transcript: string): void;
}

export async function getTranscript(
  callback: GetTranscriptCallback,
  collector: TranscriptCollector
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deepgram = new Deepgram(deepgramApiKey);

    // Create a microphone instance
    const micInstance = Mic({
      rate: "16000",
      channels: "1",
      debug: false,
    });

    const micInputStream = micInstance.getAudioStream();

    // Connect to Deepgram's real-time endpoint
    const socket = deepgram.transcription.live({
      punctuate: true,
      language: "en-US",
      encoding: "linear16",
      sample_rate: 16000,
      endpointing: 300,
      smart_format: true,
    });

    console.log("Listening...");

    socket.on("open", () => {
      micInstance.start();
    });

    socket.on("close", () => {
      console.log("WebSocket closed");
      micInstance.stop();
      resolve();
    });

    socket.on("transcriptReceived", (dgData) => {
      const { channel } = dgData;
      if (!channel) return;

      const { alternatives } = channel;
      if (!alternatives || !alternatives[0]) return;

      const transcript = alternatives[0].transcript;
      const isFinal = dgData.is_final;

      if (!isFinal) {
        // Intermediate chunk
        collector.addPart(transcript);
      } else {
        // Final chunk
        collector.addPart(transcript);
        const fullSentence = collector.getFullTranscript().trim();
        if (fullSentence.length > 0) {
          console.log(`Human: ${fullSentence}`);
          callback(fullSentence);
        }
        collector.reset();

        // If you want to stop listening right after the first sentence:
        // socket.close();
      }
    });

    // If there's an error with the WebSocket
    socket.on("error", (err) => {
      console.error("Socket error:", err);
      micInstance.stop();
      reject(err);
    });

    micInputStream.on("data", (data: Buffer) => {
      socket.send(data);
    });

    micInputStream.on("error", (err: Error) => {
      console.error("Mic error:", err);
      reject(err);
    });
  });
}
