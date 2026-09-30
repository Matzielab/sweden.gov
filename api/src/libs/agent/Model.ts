import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import Config from "@/libs/Config"

/**
 * The one model the service talks to — any OpenAI-compatible chat completions
 * endpoint, configured entirely from the environment.
 */
const provider = createOpenAICompatible({
  name: "llm",
  baseURL: Config.llm.baseUrl,
  apiKey: Config.llm.apiKey,
  includeUsage: true,
})

export const isModelConfigured = () => Boolean(Config.llm.model)

export const getModel = () => {
  if (!Config.llm.model) throw new Error("OPENAI_COMPATIBLE_MODEL is not set")
  return provider.chatModel(Config.llm.model)
}

export const describeModel = () =>
  `${Config.llm.model ?? "(no model)"} @ ${new URL(Config.llm.baseUrl).host}`
