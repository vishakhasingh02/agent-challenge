// FILE: src/mastra/agents/email-agent/email-tools.ts

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import nodemailer from "nodemailer";
import Imap from "imap-simple";
import dotenv from "dotenv";
// import { model } from "../../config";
import { createOllama } from "ollama-ai-provider";

dotenv.config();

/* ── Create a local Ollama chat model ─────────────────────────── */
const modelName = process.env.MODEL_NAME_AT_ENDPOINT ?? "qwen2.5:1.5b";
const baseURL = process.env.API_BASE_URL ?? "http://127.0.0.1:11434/api";

const model = createOllama({ baseURL }).chat(modelName, {
  simulateStreaming: true,
});
const { EMAIL_USER, EMAIL_PASS, SMTP_HOST, IMAP_HOST } = process.env;

// 📥 Fetch today's emails via IMAP
export const fetchEmailsTool = createTool({
  id: "fetchEmails",
  description: "Use this tool to fetch all emails received today from the user's Gmail inbox. This is the first step to analyze or summarize today's emails.",
  inputSchema: z.object({}),
  outputSchema: z.array(z.object({
    from: z.string(),
    subject: z.string(),
    body: z.string(),
    date: z.string(),
  })),
  execute: async () => {
    const config = {
      imap: {
        user: EMAIL_USER,
        password: EMAIL_PASS,
        host: IMAP_HOST,
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }, // <-- Add this line
        timeout: 10000, // Increase timeout to 10 seconds
      },
    };

    const connection = await Imap.connect(config);
    await connection.openBox("INBOX");

    const today = new Date().toISOString().split("T")[0];
    const searchCriteria = [["SINCE", today]];
    const fetchOptions = { bodies: ["HEADER", "TEXT"], markSeen: false };

    const results = await connection.search(searchCriteria, fetchOptions);

    const emails = results.map((res: { parts: Array<{ which: string; body: any }> }) => {
      const header = res.parts.find((p) => p.which === "HEADER")?.body;
      const body = res.parts.find((p) => p.which === "TEXT")?.body;
      return {
        from: header?.from?.[0] ?? "Unknown",
        subject: header?.subject?.[0] ?? "",
        date: header?.date?.[0] ?? "",
        body: typeof body === "string" ? body : JSON.stringify(body),
      };
    });

    return emails;
  },
});

// 🔍 Search emails with a keyword
export const searchEmailTool = createTool({
  id: "searchEmails",
  description: "Use this tool to find emails from today that match a specific keyword, sender name, or company. This is helpful when the user asks about a particular person or brand.",
  inputSchema: z.object({ keyword: z.string() }),
  outputSchema: z.array(z.object({
    from: z.string(),
    subject: z.string(),
    summary: z.string(),
  })),
  execute: async ({ context }) => {
    const emails = await fetchEmailsTool.execute({});
    const keyword = context.keyword.toLowerCase();
    const results = emails
      .filter(email =>
        email.subject.toLowerCase().includes(keyword) ||
        email.body.toLowerCase().includes(keyword)
      )
      .map(email => ({
        from: email.from,
        subject: email.subject,
        summary: email.body // simple summary: first 100 chars
      }));
    return results;
  },
});

export const composeEmailTool = createTool({
  id: "composeEmail",
  description: "Use this tool to translate, rewrite, and format a user’s message into a clear, professional email. It can determine tone and convert casual input into proper English.",
  inputSchema: z.object({
    user_message: z.string(),
    // No need to include llm in the input schema if you always use your config model
  }),
  outputSchema: z.object({
    subject: z.string(),
    emailBody: z.string(),
  }),
  execute: async (context) => {
    const prompt = `Convert this message into a formal, professional email in English with a suitable subject line. Respond in JSON with "subject" and "emailBody" fields.`;
    const res = await model.doGenerate({
       inputFormat: "messages",
    mode: { type: "regular" },
    prompt: [
      { role: "system", content: prompt },
      { role: "user", content: [{ type: "text", text: context.context.message }] },
    ],});
    console.log("sytem prompt:", prompt);
    console.log("user message:", context.context.message) ;
    console.log("composeEmailTool response:", res.text);  
    return JSON.parse(res.text);
  }});

// 📤 Send email via Gmail SMTP
export const sendEmailTool = createTool({
  id: "sendEmail",
  description: "Use this tool to send a fully composed email to a given recipient address with a subject line and body. This should only be used after the email content is prepared.",
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    emailBody: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: context.to,
      subject: context.subject,
      text: context.emailBody,
    });

    return {
      success: true,
      message: `Email sent to ${context.to} with subject "${context.subject}"`,
    };
  },
});
