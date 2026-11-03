import { createAgent } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";

export type CreateOpenRouterAgentParams = {
  // chave do dono do cliente (resolveAiKey); sem ela o ChatOpenRouter cairia na chave da ady do .env
  apiKey: string;
  tools?: any[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  /** Zod schema (ou JsonSchemaFormat) p/ saída estruturada — vira responseFormat do createAgent. */
  responseFormat?: any;
};

export function createOpenRouterAgent({
  apiKey,
  tools = [],
  systemPrompt = "You are a helpful assistant",
  model = "deepseek/deepseek-v4-flash",
  temperature = 0,
  responseFormat,
}: CreateOpenRouterAgentParams) {
  const llm = new ChatOpenRouter({ model, temperature, apiKey });
  return createAgent({
    model: llm,
    tools,
    systemPrompt,
    ...(responseFormat ? { responseFormat } : {}),
  });
}

export function createBasicAgent(
  systemPrompt: string,
  apiKey: string,
  model = "deepseek/deepseek-v4-flash",
  responseFormat?: CreateOpenRouterAgentParams["responseFormat"]
) {
  return createOpenRouterAgent({
    apiKey,
    tools: [],
    systemPrompt,
    model,
    temperature: 0,
    responseFormat,
  });
}