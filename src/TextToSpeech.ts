// src/TextToSpeech.ts
import axios from "axios";
import * as childProcess from "child_process";
import * as fs from "fs";
import path from "path";

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
