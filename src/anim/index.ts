import { idle } from './idle';
import { talking } from './talking';
import { listening } from './listening';
import type { Animation } from './types';

export const ANIMATIONS: Animation[] = [idle, talking, listening];
