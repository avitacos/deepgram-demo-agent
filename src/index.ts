import "dotenv/config";
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

// TODO: create a types/record-lpcm16.d.ts type file since it doesn't exist
// @ts-ignore
import recorder from "node-record-lpcm16";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class TextToSpeech {
  private readonly DG_API_KEY = process.env.DEEPGRAM_API_KEY;
  private readonly MODEL_NAME = "aura-helios-en";

  private isFfplayInstalled(): boolean {
    try {
      childProcess.execSync("which ffplay", { stdio: "ignore" });
      return true;
    } catch (e) {
      return false;
    }
  }

  public async speak(text: string | undefined): Promise<void> {
    if (!text) return;
    if (!this.isFfplayInstalled()) {
      throw new Error("ffplay not found, necessary to stream audio.");
    }
    const DEEPGRAM_URL = `https://api.deepgram.com/v1/speak?model=${this.MODEL_NAME}&encoding=linear16&sample_rate=24000`;

    const headers = {
      Authorization: `Token ${this.DG_API_KEY}`,
      "Content-Type": "application/json",
    };

    const payload = { text };

    // Hiding common ffplay warnings for clear console
    const ffplayArgs = [
      '-hide_banner',       // hide the banner
      '-loglevel', 'quiet', // suppress warnings and errors
      '-i', 'pipe:0',       // read from stdin
      '-autoexit',          // close when done
      '-nodisp'             // don’t show any window
    ];

    // Start a child process to run ffplay and feed it the audio from TTS.
    const ffplay = childProcess.spawn("ffplay", ffplayArgs, {
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

    const promptPath = path.resolve(__dirname, "./systemPrompt.txt");
    this.systemPrompt = fs.readFileSync(promptPath, "utf8").trim();

    this.memory.push({
      role: "system",
      content: this.systemPrompt,
    });
  }

  public async process(text: string): Promise<string | undefined> {
    if (text.length < 1) {
      return Promise.resolve(undefined);
    }

    this.memory.push({
      role: "user",
      content: text,
    });

    const startTime = Date.now();

    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: this.memory,
      temperature: 0,
    });

    const endTime = Date.now();

    const elapsed = endTime - startTime;

    const assistantMessage = response.choices?.[0]?.message?.content ?? "";

    console.log(`LLM (${elapsed}ms): ${assistantMessage}`);

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

class ConversationManager {
  private deepgramConnection: ListenLiveClient | null = null;
  private recording: ReturnType<typeof recorder.record> | null = null;

  // private transcriptionResponse = "";
  private llm: LanguageModelProcessor;
  private tts: TextToSpeech;
  private collector: TranscriptCollector;

  constructor() {
    this.llm = new LanguageModelProcessor();
    this.tts = new TextToSpeech();
    this.collector = new TranscriptCollector();
  }

  public async start(): Promise<void> {
    console.log("Starting conversation manager...");
    const deepgram = createClient(deepgramApiKey);

    this.deepgramConnection = deepgram.listen.live({
      model: "nova-2",
      punctuate: true,
      language: "en-US",
      encoding: "linear16",
      sample_rate: 16000, 
      endpointing: 300,   
      smart_format: true,
      vad: false,        
    });

    this.deepgramConnection.addListener(LiveTranscriptionEvents.Open, () => {
      console.log("Deepgram connection opened.");
    });

    this.deepgramConnection.addListener(LiveTranscriptionEvents.Transcript, (dgData: any) => {
      const { channel, is_final } = dgData;
      if (!channel) return;

      const alternatives = channel.alternatives;
      if (!alternatives || !alternatives[0]) return;

      const transcript = alternatives[0].transcript;
      if (!is_final) {
        this.collector.addPart(transcript);
      } else {
        // final
        this.collector.addPart(transcript);
        const fullSentence = this.collector.getFullTranscript().trim();
        this.collector.reset();

        if (fullSentence) {
          console.log("Human:", fullSentence);
          this.handleUserTranscript(fullSentence);
        }
      }
    });

    this.deepgramConnection.addListener(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed.");
      this.stopMicrophone();
    });

    this.deepgramConnection.addListener(LiveTranscriptionEvents.Error, (error) => {
      console.error("Deepgram error:", error);
      this.stopMicrophone();
    });

    this.startMicrophone();

    // Keep sessions to only 30 seconds
    const TIMEOUT_MS = 30_000; // 30 seconds
    setTimeout(() => {
      console.log("Conversation time limit reached, stopping conversation...");
      this.stop();
    }, TIMEOUT_MS);
  }

  private async handleUserTranscript(fullSentence: string): Promise<void> {
    // TODO: Handle when user says goodbye in a sentence but didn't mean to end the conversation
    if (fullSentence.toLowerCase().includes("goodbye")) {
      console.log("User said goodbye. Stopping conversation...");
      this.stop();
      return;
    }

    const llmResponse = await this.llm.process(fullSentence);

    await this.tts.speak(llmResponse);
  }

  private startMicrophone(): void {
    console.log("Starting microphone recording...");

    this.recording = recorder.record({
      sampleRate: 16000, // Must match the connection.sample_rate
      // threshold: 0.5, // Add threshold if audio is picking up non word sounds
    });

    const micStream = this.recording.stream();

    micStream.on("data", (chunk: Buffer) => {
      if (this.deepgramConnection) {
        this.deepgramConnection.send(chunk);
      }
    });

    micStream.on("error", (err: Error) => {
      console.error("Microphone error:", err);
    });
  }

  private stopMicrophone(): void {
    if (this.recording) {
      console.log("Stopping microphone recording...");
      this.recording.stop();
      this.recording = null;
    }
  }

  public stop(): void {
    console.log("Stopping conversation manager...");

    if (this.deepgramConnection) {
      // This triggers the 'Close' event, which also calls stopMicrophone()
      this.deepgramConnection.requestClose();
      this.deepgramConnection = null;
    } else {
      this.stopMicrophone();
    }
  }
}

async function runApp() {
  const manager = new ConversationManager();
  await manager.start();
}

if (require.main === module) {
  runApp().catch((err) => {
    console.error("Error running app:", err);
  });
}
