// src/ConversationManager.ts
import { getTranscript } from "./getTranscript";
import { TranscriptCollector } from "./TranscriptCollector";
import { LanguageModelProcessor } from "./LanguageModelProcessor";
import { TextToSpeech } from "./TextToSpeech";

export class ConversationManager {
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
