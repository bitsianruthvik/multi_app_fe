export interface Action {
  id: number;
  name: string;
  description?: string;
  display_order: number;
}

export interface Brand {
  name: string; // the raw medicine string from audio_recordings
}
