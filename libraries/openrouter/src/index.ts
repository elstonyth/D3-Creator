// libraries/openrouter/src/index.ts — the ONLY definition of these shapes.
// A barrel. Consumers import `@d3/openrouter` and nothing deeper.
//
// The complete surface is PRD 1 §8.3.2. A name not re-exported here does not
// exist to a consumer; `@d3/openrouter/*` is in tsconfig `paths` only so a
// future internal split does not break, and importing through it is a review
// failure. There is no `raw` field, no `parseCallUsage` export and no
// `openrouterPost` export — the client parses usage, and a caller that wants the
// raw body is re-implementing the client.

export {
  // message shapes
  type ChatTextPart,
  type ChatVideoPart,
  type ChatContentPart,
  type ChatMessage,
  // usage
  type OpenRouterCallUsage,
  // chat + vision
  type ChatCompletionOptions,
  type ChatCompletionResult,
  chatCompletion,
  // speech to text
  type TranscribeOptions,
  type TranscriptionSegment,
  type TranscriptionResult,
  transcribeAudio,
  // constants and small helpers
  CHAT_TIMEOUT_MS,
  TRANSCRIBE_TIMEOUT_MS,
  VIDEO_MIME,
  requireApiKey,
  requireModelId,
  videoDataUri,
  extractJsonObject,
  // errors
  OpenRouterConfigError,
  OpenRouterTimeoutError,
  OpenRouterAbortedError,
  OpenRouterRequestError,
} from './client';
