/**
 * The provider layer.
 *
 * Nothing above this file names a model. The pipeline names a CAPABILITY and
 * the registry resolves it, because the model table ages in months and the
 * stages do not. Swapping Seedance for whatever replaces it is a new row here
 * and no change anywhere else.
 *
 * The capability flags are not documentation — the pipeline BRANCHES on them.
 * A route that cannot select a face is why speaker boxes exist; a route that
 * generates speech is why dialogue never enters a prompt.
 */

export type Capability = {
  /** How many references the route holds before identity starts slipping. */
  refsMax: number;
  /** True: image 1 is a literal first frame. False: it composes, and must be TOLD to reproduce one. */
  firstFrame: boolean;
  /** Accepts reference audio. Voice character only on every route measured — none take words from it. */
  audioIn: boolean;
  /** Generates its own audio. Discarded whenever the production has cast recordings. */
  audioOut: boolean;
  /** 'generated' — the route invents speech from the prompt, so the prompt must carry NO dialogue. */
  speech: 'generated' | 'generated-lipsynced' | 'none';
  durSeconds: [number, number];
  resolutions: string[];
  grammar: 'seedance-core' | 'multi-reference' | 'staged';
};

export type LipsyncCapability = {
  /**
   * Can the route be told WHICH face to drive?
   *
   * Every route measured says false. That single flag is why the shot card
   * carries a speaker box: on a two-shot the service finds a face and drives
   * it, and the first time it ran it put one man's line on the other man's
   * mouth. When this is false the pipeline crops to the speaker, syncs the
   * crop, and composites it back at the same coordinates.
   */
  faceSelect: boolean;
  models: string[];
};

export type ReferenceSpec = {
  url: string;
  mediaType: 'image' | 'video' | 'audio';
  /** Its ONE role. Half a role is "defines motion"; the other half is what it must not touch. */
  role: string;
  controls: string;
  mustNotTouch?: string;
  /** Position in the prompt's Image 1..N numbering. Order is the contract. */
  order: number;
};

export type VideoGenerationRequest = {
  idempotencyKey: string;
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
  references: ReferenceSpec[];
  /** Almost always false on a production with a cast: the voice arrives at the sync stage. */
  outputAudio: boolean;
};

export type ProviderTask = {
  providerTaskId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  outputUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  raw: unknown;
};

export interface VideoProvider {
  readonly name: string;
  readonly capability: Capability;
  createTask(req: VideoGenerationRequest): Promise<ProviderTask>;
  getTask(id: string): Promise<ProviderTask>;
  cancelTask?(id: string): Promise<void>;
}

export interface ImageProvider {
  readonly name: string;
  readonly refsMax: number;
  /** 'manual' means a human generates it and drops the file in — the most accurate route we have. */
  readonly transport: 'api' | 'manual';
  create(req: { prompt: string; references: ReferenceSpec[]; aspectRatio: string }): Promise<{ url: string }>;
}

export interface VoiceProvider {
  readonly name: string;
  /** True if the model takes inline performance direction rather than choosing the acting itself. */
  readonly directed: boolean;
  speak(req: { text: string; voiceId: string; settings?: Record<string, number> }): Promise<{ url: string }>;
}

export interface LipsyncProvider {
  readonly name: string;
  readonly capability: LipsyncCapability;
  /**
   * Drive a mouth from our recording.
   *
   * When capability.faceSelect is false the CALLER must crop to the speaker
   * first — this interface deliberately has no face argument, so the limitation
   * cannot be forgotten at the call site.
   */
  sync(req: { videoUrl: string; audioUrl: string; model?: string }): Promise<{ url: string }>;
}

/** Everything a shot needs, resolved once, so a compile is reproducible. */
export interface ProviderSet {
  image: ImageProvider;
  video: VideoProvider;
  voice: VoiceProvider;
  lipsync: LipsyncProvider;
}

/**
 * Pipeline decisions that fall out of capability rather than configuration.
 * Kept here so a new provider inherits the right behaviour automatically.
 */
export const derive = {
  /** Dialogue words belong in a prompt only if nothing downstream will re-drive the mouth. */
  promptCarriesDialogue: (v: Capability, l: LipsyncProvider | null) =>
    v.speech === 'none' && l === null,

  /** The route's own audio reaches the cut only when the production has no recordings. */
  keepGeneratedAudio: (hasCastRecordings: boolean) => !hasCastRecordings,

  /** A multi-face frame with a line needs a crop when the sync route cannot choose. */
  needsSpeakerBox: (facesInFrame: number, hasLine: boolean, l: LipsyncProvider) =>
    hasLine && facesInFrame > 1 && !l.capability.faceSelect,

  /** Composition is guaranteed only when the route treats image 1 as a literal first frame. */
  mustAssertComposition: (v: Capability) => !v.firstFrame,

  /** Shorter beats are shot at the floor and trimmed, never asked for directly. */
  renderSeconds: (wanted: number, v: Capability) =>
    Math.min(Math.max(wanted, v.durSeconds[0]), v.durSeconds[1]),
};
