export class TranscriptCollector {
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
