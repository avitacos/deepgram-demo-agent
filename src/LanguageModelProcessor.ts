// src/LanguageModelProcessor.ts
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";
import path from "path";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LanguageModelProcessor {
  private openai: OpenAIApi;
  private memory: Message[] = [];
  private systemPrompt: string;

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);

    // Load system prompt
    const promptPath = path.resolve(__dirname, "../system_prompt.txt");
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
    const response = await this.openai.createChatCompletion({
      model: "gpt-3.5-turbo", // Or 'gpt-4' if your API key has access
      messages: this.memory,
      temperature: 0,
    });

    const endTime = Date.now();

    const elapsed = endTime - startTime;
    const assistantMessage = response.data.choices?.[0]?.message?.content ?? "";

    console.log(`LLM (${elapsed}ms): ${assistantMessage}`);

    // Add AI message to the memory
    this.memory.push({
      role: "assistant",
      content: assistantMessage,
    });

    return assistantMessage;
  }
}
