export type Signal = "LONG" | "SHORT" | "NEUTRAL";

export interface AnalysisResponse {
  signal: Signal;
  expiry_minutes: number;
  reasoning: string;
}
