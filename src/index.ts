// Project inspired by Greg Kamradt: https://www.youtube.com/@DataIndependent
// Switch to node-record-lpcm16?: https://www.npmjs.com/package/node-record-lpcm16

import "dotenv/config"; // Load .env
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import axios from "axios";
import * as childProcess from "child_process";
import {
  createClient,
  ListenLiveClient,
  LiveTranscriptionEvents,
} from "@deepgram/sdk";
// @ts-ignore
import Mic from "mic";
// import * as  Mic from "mic";
// import { Deepgram } from "@deepgram/sdk";
// import { spawn } from "child_process";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class TextToSpeech {
  private readonly DG_API_KEY = process.env.DEEPGRAM_API_KEY;
  private readonly MODEL_NAME = "aura-helios-en"; // update if needed

  private isFfplayInstalled(): boolean {
    try {
      childProcess.execSync("which ffplay", { stdio: "ignore" });
      return true;
    } catch (e) {
      return false;
    }
  }

  public async speak(text: string): Promise<void> {
    if (!this.isFfplayInstalled()) {
      throw new Error("ffplay not found, necessary to stream audio.");
    }

    const DEEPGRAM_URL = `https://api.deepgram.com/v1/speak?model=${this.MODEL_NAME}&performance=some&encoding=linear16&sample_rate=24000`;

    const headers = {
      Authorization: `Token ${this.DG_API_KEY}`,
      "Content-Type": "application/json",
    };

    const payload = { text };

    // Start a child process to run ffplay and feed it the audio from TTS.
    const ffplay = childProcess.spawn("ffplay", ["-autoexit", "-", "-nodisp"], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    const startTime = Date.now();
    let firstByteTime: number | null = null;

    try {
      const response = await axios.post(DEEPGRAM_URL, payload, {
        headers,
        responseType: "stream",
      });

      response.data.on("data", (chunk: Buffer) => {
        if (!firstByteTime) {
          firstByteTime = Date.now();
          const ttfb = firstByteTime - startTime;
          console.log(`TTS Time to First Byte (TTFB): ${ttfb}ms\n`);
        }
        ffplay.stdin.write(chunk);
      });

      // Once streaming is done, close ffplay's stdin so it can exit.
      response.data.on("end", () => {
        if (ffplay.stdin) {
          ffplay.stdin.end();
        }
      });
    } catch (err) {
      console.error("Error with TTS request: ", err);
      ffplay.kill("SIGTERM");
    }

    // Wait for ffplay to exit
    await new Promise((resolve) => {
      ffplay.on("close", () => {
        resolve(true);
      });
    });
  }
}

class LanguageModelProcessor {
  private openai: OpenAI;
  private memory: Message[] = [];
  private systemPrompt: string;

  constructor() {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = openai;

    // Load system prompt
    const promptPath = path.resolve(__dirname, "./systemPrompt.txt");
    this.systemPrompt = fs.readFileSync(promptPath, "utf8").trim();

    // Initialize memory with the system prompt at the start
    this.memory.push({
      role: "system",
      content: this.systemPrompt,
    });
  }

  public async process(text: string): Promise<string> {
    // Add user message to the memory
    this.memory.push({
      role: "user",
      content: text,
    });

    const startTime = Date.now();

    // Invoke ChatGPT
    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or 'gpt-4' if your API key has access
      messages: this.memory,
      temperature: 0,
    });

    const endTime = Date.now();

    const elapsed = endTime - startTime;

    const assistantMessage = response.choices?.[0]?.message?.content ?? "";

    console.log(`LLM (${elapsed}ms): ${assistantMessage}`);

    // Add AI message to the memory
    this.memory.push({
      role: "assistant",
      content: assistantMessage,
    });

    return assistantMessage;
  }
}

class TranscriptCollector {
  private transcriptParts: string[];

  constructor() {
    this.transcriptParts = [];
  }

  public reset(): void {
    this.transcriptParts = [];
  }

  public addPart(part: string): void {
    this.transcriptParts.push(part);
  }

  public getFullTranscript(): string {
    return this.transcriptParts.join(" ");
  }
}

const deepgramApiKey = process.env.DEEPGRAM_API_KEY || "";

interface GetTranscriptCallback {
  (transcript: string): void;
}

async function getTranscript(
  callback: GetTranscriptCallback,
  collector: TranscriptCollector
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deepgram = createClient(deepgramApiKey);

    // Create a microphone instance
    const micInstance = Mic({
      rate: "24000",
      channels: "1",
      debug: true, // was false before!
    });

    const micInputStream = micInstance.getAudioStream();

    // MicInputStream tests:
    micInputStream.on("startComplete", () => {
      console.log("Mic recording started");
    });

    micInputStream.on("stopComplete", () => {
      console.log("Mic recording stopped");
    });

    micInputStream.on("pauseComplete", () => {
      console.log("Mic recording paused");
    });

    // This event fires whenever data is read from the mic
    // micInputStream.on("data", (chunk: Buffer) => {
    //   console.log(`Mic data chunk of size: ${chunk.length}`);
    // });

    // If there’s an error
    micInputStream.on("error", (err: Error) => {
      console.error("Mic error:", err);
    });
    // End tests

    // Connect to Deepgram's real-time endpoint
    const connection: ListenLiveClient = deepgram.listen.live({
      model: "nova-2",
      punctuate: true,
      language: "en-US",
      encoding: "linear16",
      sample_rate: 24000, // or 24000 if that’s what SoX is actually using
      endpointing: 300,
      smart_format: true,
    });

    console.log("Connecting...");

    // Listen for open
    connection.addListener(LiveTranscriptionEvents.Open, () => {
      console.log("Deepgram connection open, starting mic...");
      // micInstance.start() or relevant method
    });

    // Listen for transcripts
    connection.addListener(
      LiveTranscriptionEvents.Transcript,
      (dgData: any) => {
        const { channel, is_final } = dgData;
        if (!channel) return;

        const { alternatives } = channel;
        if (!alternatives || !alternatives[0]) return;

        const transcript = alternatives[0].transcript;

        if (!is_final) {
          // Partial chunk
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

          // If you only want one utterance per invocation:
          // finish the connection so we can resolve the promise // .finished is depricated
          connection.requestClose();
        }
      }
    );

    // Listen for close
    connection.addListener(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed.");
      // Stop the mic if it's still running
      micInstance.stop();

      // Resolve the Promise so your ConversationManager can proceed
      resolve();
    });

    // Listen for errors
    connection.addListener(LiveTranscriptionEvents.Error, (error) => {
      console.error("Deepgram error", error);
      micInstance.stop();
      reject(error);
    });

    // socket.on("open", () => {
    //   micInstance.start();
    // });

    // socket.on("close", () => {
    //   console.log("WebSocket closed");
    //   micInstance.stop();
    //   resolve();
    // });

    //
    // socket.on("transcriptReceived", (dgData) => {
    //   const { channel } = dgData;
    //   if (!channel) return;

    //   const { alternatives } = channel;
    //   if (!alternatives || !alternatives[0]) return;

    //   const transcript = alternatives[0].transcript;
    //   const isFinal = dgData.is_final;

    //   if (!isFinal) {
    //     // Intermediate chunk
    //     collector.addPart(transcript);
    //   } else {
    //     // Final chunk
    //     collector.addPart(transcript);
    //     const fullSentence = collector.getFullTranscript().trim();
    //     if (fullSentence.length > 0) {
    //       console.log(`Human: ${fullSentence}`);
    //       callback(fullSentence);
    //     }
    //     collector.reset();

    //     // If you want to stop listening right after the first sentence:
    //     // socket.finish()
    //   }
    // });

    // If there's an error with the WebSocket - This is seemingly the old way and mostly depricated
    // socket.on("error", (err: {}) => {
    //   console.error("Socket error:", err);
    //   micInstance.stop();
    //   reject(err);
    // });

    // micInputStream.on("data", (data: Buffer) => {
    //   socket.send(data);
    //   console.log("Sending chunk to Deepgram, size:", data.length);
    // });

    // micInputStream.on("error", (err: Error) => {
    //   console.error("Mic error:", err);
    //   reject(err);
    // });
  });
}

class ConversationManager {
  private transcriptionResponse = "";
  private llm: LanguageModelProcessor;
  private tts: TextToSpeech;
  private collector: TranscriptCollector;

  constructor() {
    this.llm = new LanguageModelProcessor();
    this.tts = new TextToSpeech();
    this.collector = new TranscriptCollector();
  }

  public async main(): Promise<void> {
    const handleFullSentence = (fullSentence: string) => {
      this.transcriptionResponse = fullSentence;
    };

    while (true) {
      await getTranscript(handleFullSentence, this.collector);

      // Check for "goodbye"
      if (this.transcriptionResponse.toLowerCase().includes("goodbye")) {
        break;
      }

      // Send the final transcript to LLM
      const llmResponse = await this.llm.process(this.transcriptionResponse);

      // TTS
      await this.tts.speak(llmResponse);

      // Reset transcription response
      this.transcriptionResponse = "";
    }
  }
}

async function runApp() {
  const manager = new ConversationManager();
  await manager.main();
  console.log("Conversation ended. Goodbye!");
}

if (require.main === module) {
  runApp().catch((err) => {
    console.error("Error running app:", err);
  });
}
