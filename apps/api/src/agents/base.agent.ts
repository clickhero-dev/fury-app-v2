import { createAgent } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";

export type CreateOpenRouterAgentParams = {
  tools?: any[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  /** Zod schema (ou JsonSchemaFormat) p/ saída estruturada — vira responseFormat do createAgent. */
  responseFormat?: any;
};

export function createOpenRouterAgent({
  tools = [],
  systemPrompt = "You are a helpful assistant",
  model = "deepseek/deepseek-chat-v4-flash",
  temperature = 0,
  responseFormat,
}: CreateOpenRouterAgentParams = {}) {
  const llm = new ChatOpenRouter({ model, temperature });
  return createAgent({
    model: llm,
    tools,
    systemPrompt,
    ...(responseFormat ? { responseFormat } : {}),
  });
}

export function createBasicAgent(
  systemPrompt: string,
  model = "deepseek/deepseek-chat-v4-flash",
  responseFormat?: CreateOpenRouterAgentParams["responseFormat"]
) {
  return createOpenRouterAgent({
    tools: [],
    systemPrompt,
    model,
    temperature: 0,
    responseFormat,
  });
}