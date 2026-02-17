import express from "express";
import fs from "fs";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pn from "awesome-phonenumber";
import { upload } from "./mega.js";

const router = express.Router();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error("Error removing file:", e);
    }
}

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+#[^\/]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

router.get("/", async (req, res) => {
    let num = req.query.number;
    let dirs = "./" + (num || "session");

    await removeFile(dirs);

    num = num.replace(/[^0-9]/g, "");
    const phone = pn("+" + num);

    if (!phone.isValid()) {
        return res.status(400).send({
            code: "Invalid phone number. Use full international format without +",
        });
    }

    num = phone.getNumber("e164").replace("+", "");

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" })
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.windows("Chrome"),
                markOnlineOnConnect: false,
            });

            KnightBot.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    try {
                        const credsPath = `${dirs}/creds.json`;
                        const megaUrl = await upload(
                            credsPath,
                            `creds_${num}_${Date.now()}.json`
                        );

                        const megaFileId = getMegaFileId(megaUrl);
                        const userJid = jidNormalizedUser(
                            num + "@s.whatsapp.net"
                        );

                        if (megaFileId) {
                            // ✅ SEND IMAGE + SESSION ID
                            await KnightBot.sendMessage(userJid, {
                                image: {
                                    url: "https://github.com/bhanukamd1233-cyber/Bhanuka_MD/blob/main/images/web%20pair.png?raw=true",
                                },
                                caption:
`✅ *BHANUKA MD WEB PAIR*

🔐 *SESSION ID*
\`\`\`
${megaFileId}
\`\`\`

⚠️ Keep this ID safe
Do not share with anyone`,
                            });
                        }

                        await delay(1000);
                        removeFile(dirs);
                        await delay(1500);
                        process.exit(0);
                    } catch (err) {
                        console.error("Upload error:", err);
                        removeFile(dirs);
                        process.exit(1);
                    }
                }

                if (connection === "close") {
                    const statusCode =
                        lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) initiateSession();
                }
            });

            if (!KnightBot.authState.creds.registered) {
                await delay(3000);
                let code = await KnightBot.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;

                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            KnightBot.ev.on("creds.update", saveCreds);
        } catch (err) {
            console.error(err);
            if (!res.headersSent) {
                res.status(503).send({ code: "Service unavailable" });
            }
            process.exit(1);
        }
    }

    await initiateSession();
});

export default router;
