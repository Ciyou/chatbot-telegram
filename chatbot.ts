
import _ from "npm:lodash@^4.17.21"
import { ChatGPTAPI, ChatGPTConversation } from "npm:chatgpt@^2.0.4"
// @deno-types="npm:@types/node-telegram-bot-api@^0.57.6"
import TelegramBot from "npm:node-telegram-bot-api@^0.60.0"

import "https://deno.land/x/dotenv@v3.2.0/load.ts"

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")
const SESSION_TOKEN = Deno.env.get("SESSION_TOKEN")

if (!BOT_TOKEN || !SESSION_TOKEN) {
    logWithTime("⛔️ BOT_TOKEN and SESSION_TOKEN must be set")
    Deno.exit(1)
}

// Start telegram bot

const bot = new TelegramBot(BOT_TOKEN, { polling: true })
const botInfo = await bot.getMe()
const botName = botInfo.username ?? ""

if (!botName) {
    logWithTime("⛔️ Bot username not found")
    Deno.exit(1)
} else {
    logWithTime("🤖 Bot", `@${botName}`, "has started...")
}

// Start ChatGPT API

let chatGPTAPI: ChatGPTAPI
try {
    chatGPTAPI = new ChatGPTAPI({sessionToken: SESSION_TOKEN})
    await chatGPTAPI.ensureAuth()
    await chatGPTAPI.refreshAccessToken()
} catch (err) {
    logWithTime("⛔️ ChatGPT API error:", err)
    Deno.exit(1)
}
logWithTime("🔮 ChatGPT API has started...")

let conversation: ChatGPTConversation = chatGPTAPI.getConversation()
logWithTime("🔄 ChatGPT Conversation initialized")

// Handle messages
bot.on("message", async (msg) => {
    await handleMessage(msg)
})

function handleCommand(msg: TelegramBot.Message): boolean {
    // reload command
    if (msg.text === "/reload") {
        conversation = chatGPTAPI.getConversation()
        bot.sendMessage(msg.chat.id, "🔄 Conversation has been reset, enjoy!")
        logWithTime("🔄 Conversation has been reset, new conversation id")
        return true
    }
    // help command
    if (msg.text === "/help") {
        bot.sendMessage(msg.chat.id, "🤖 This is a chatbot powered by ChatGPT. You can use the following commands:\n\n/reload - Reset the conversation\n/help - Show this message")
        return true
    }
    return false
}


// Parse message and send to ChatGPT if needed
async function handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id
    if (!msg.text) {
        return
    }

    // Only respond to messages that start with @botName in a group chat
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        if (!msg.text.startsWith(`@${botName}`)) {
            return
        }
    }
    

    // Remove @botName from message
    const message = msg.text.replace(`@${botName}`, "").trim()
    if (message === "") {
        return
    }

    // Handle commands if needed
    if (handleCommand(msg)) {
        return
    }

    logWithTime(`📩 Message from ${msg.chat.id}:`, message)

    // Send a message to the chat acknowledging receipt of their message
    let respMsg = await bot.sendMessage(chatId, "🤔", {
        reply_to_message_id: msg.message_id,
    })
    bot.sendChatAction(chatId, "typing")

    // Send message to ChatGPT
    try {
        const response = await conversation.sendMessage(message, {
            onProgress: _.throttle(async (partialResponse: string) => {
                respMsg = await editMessage(respMsg, partialResponse)
                bot.sendChatAction(chatId, "typing")
            }, 4000, { leading: true, trailing: false }),
        })
        editMessage(respMsg, response)
        logWithTime("📨 Response:", response)
    } catch (err) {
        logWithTime("⛔️ ChatGPT API error:", err.message)
        // 如果错误包含 session token has expired，那么重新获取 session token
        if (err.message.includes("session token has expired")) {
            bot.sendMessage(chatId, "🔑 Token has expired, please update the token.")
        } else {
            bot.sendMessage(chatId, "🤖 Sorry, I'm having trouble connecting to the server, please try again later.")
        }
    }
}

// Edit telegram message
async function editMessage(msg: TelegramBot.Message, text: string, needParse = true): Promise<TelegramBot.Message> {
    if (msg.text === text) {
        return msg
    }
    try {
        const resp = await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: needParse ? "Markdown" : undefined,
        })
         // type of resp is boolean | Message
        if (typeof resp === "object") {
            // return a Message type instance if resp is a Message type
            return resp as TelegramBot.Message;
        } else {
            // return the original message if resp is a boolean type
            return msg;
        }
    } catch (err) {
        logWithTime("⛔️ Edit message error:", err.message)
        return msg
    }
}


// deno-lint-ignore no-explicit-any
function logWithTime(... args: any[]) {
  console.log(new Date().toLocaleString(), ...args)
}