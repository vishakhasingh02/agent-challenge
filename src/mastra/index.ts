import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { emailCommandWorkflow } from "./agents/email-agent/email-workflow";
import { emailManagerAgent } from "./agents/email-agent/email-agent";

export const mastra = new Mastra({
	workflows: { emailCommandWorkflow }, // add recipe
  	agents: { emailManagerAgent }, // add recipe
	logger: new PinoLogger({
		name: "Mastra",
		level: "info",
	}),
	server: {
		port: 8080,
		timeout: 10000,
	},
});
