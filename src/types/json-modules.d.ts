declare module '*/anthropic-models.json' {
  interface AnthropicModel {
    id: string;
    name: string;
    description: string;
    type: string;
    contextWindow: number;
    maxTokens: number;
    inputCost: number;
    outputCost: number;
    features: {
      streaming: boolean;
      functionCalling: boolean;
      vision: boolean;
      codeGeneration: boolean;
    };
  }

  const content: {
    models: AnthropicModel[];
  };
  export default content;
}

declare module '*/openai-models.json' {
  interface OpenAIModel {
    id: string;
    name: string;
    description: string;
    type: string;
    contextWindow: number;
    maxTokens: number;
    inputCost: number;
    outputCost: number;
    features: {
      streaming: boolean;
      functionCalling: boolean;
      vision: boolean;
      codeGeneration: boolean;
    };
  }

  const content: {
    models: OpenAIModel[];
  };
  export default content;
}

declare module '*/embedding-models.json' {
  interface EmbeddingModel {
    id: string;
    name: string;
    description: string;
    dimensions: number;
    inputCost: number;
  }

  const content: {
    models: {
      [providerId: string]: EmbeddingModel[];
    };
  };
  export default content;
}