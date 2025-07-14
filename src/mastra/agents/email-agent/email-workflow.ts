import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { emailManagerAgent } from "./email-agent";

const detectIntent = createStep({
  id: "detect-user-intent",
  description: "Figure out what the user wants to do",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({
    intent: z.enum(["summary", "reply", "send", "search"]),
    arguments: z.record(z.string()),
  }),
  execute: async ({ inputData, tools }) =>
    tools.detectIntentTool({ query: inputData.query }),
});

const doAction = createStep({
  id: "handle-email-action",
  description: "Run the matched tool for the intent",
  inputSchema: detectIntent.outputSchema,
  outputSchema: z.any(),
  execute: async ({ inputData, tools }) => {
    const { intent, arguments: args } = inputData;

    // Use the model to decide which tool to call
    const toolDecision = await emailManagerAgent.model.complete({
      messages: [
        {
          role: "system",
          content: `Map this intent to tool call name: ${intent}. Available tools: fetchTodayEmailsTool, summarizeEmailsTool, replyToEmailTool, sendNewEmailTool, searchEmailsTool`,
        },
        {
          role: "user",
          content: JSON.stringify({ intent }),
        },
      ],
    });

    const toolId = toolDecision.content.trim();

    return await tools[toolId](args);
  },
});

export const emailCommandWorkflow = createWorkflow({
  id: "email-command-workflow",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.any(),
})
  .then(detectIntent)
  .then(doAction);

emailCommandWorkflow.commit();
