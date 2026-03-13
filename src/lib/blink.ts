import { createClient } from '@blinkdotnew/sdk';

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'movies-tv-recaps-maker-hub-hr704mxx',
  auth: {
    mode: 'managed'
  }
});

export interface RecapRecord {
  id: string;
  userId: string;
  title: string;
  genre?: string;
  description?: string;
  scriptText: string;
  videoUrl?: string;
  audioUrl?: string;
  duration: number;
  cutInterval: number;
  createdAt: string;
}
