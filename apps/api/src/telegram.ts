import { config } from "./config.js";

export async function sendTelegramTop5Message(input: {
  bib: string;
  checkpointCode: string;
  position: number;
  scannedAt: string;
}) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    return {
      delivered: false,
      messageId: null
    };
  }

  const text = [
    "Top 5 Update",
    `BIB #${input.bib}`,
    `Checkpoint: ${input.checkpointCode}`,
    `Posisi: #${input.position}`,
    `Waktu scan: ${new Date(input.scannedAt).toLocaleString("id-ID")}`
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text
    })
  });

  if (!response.ok) {
    return {
      delivered: false,
      messageId: null
    };
  }

  const payload = (await response.json()) as {
    ok: boolean;
    result?: { message_id?: number };
  };

  return {
    delivered: payload.ok,
    messageId: payload.result?.message_id ? String(payload.result.message_id) : null
  };
}
