const { google } = require("googleapis");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  let body = '';
  if (payload.body && payload.body.data) {
    body += decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        body += decodeBase64(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = decodeBase64(part.body.data);
        body += html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      } else if (part.parts) {
        body += extractBody(part);
      }
    }
  }
  return body.slice(0, 3000);
}

async function getGmailMessages(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const queries = [
    "subject:(shipped OR tracking OR delivery) newer_than:60d",
    "subject:(order confirmed OR out for delivery OR package) newer_than:60d",
  ];

  const allMessages = [];
  const seen = new Set();

  for (const q of queries) {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 15,
    });
    for (const msg of res.data.messages || []) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        allMessages.push(msg);
      }
    }
  }

  const details = await Promise.all(
    allMessages.slice(0, 20).map((msg) =>
      gmail.users.messages
        .get({ userId: "me", id: msg.id, format: "full" })
        .then((r) => {
          const headers = r.data.payload.headers;
          const get = (name) => headers.find((h) => h.name === name)?.value || "";
          const body = extractBody(r.data.payload);
          return `Subject: ${get("Subject")}\nFrom: ${get("From")}\nDate: ${get("Date")}\nSnippet: ${r.data.snippet}\nBody: ${body}`;
        })
        .catch(() => null)
    )
  );

  return details.filter(Boolean).join("\n\n---\n\n");
}

async function extractPackages(emailData) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: `You extract shipment data from email content. Today is ${today}. Return ONLY a JSON array with these fields per shipment:
- id: unique string (use order number or generate one)
- item: product name or order description (max 60 chars)
- retailer: sender/store name
- status: "arriving" (today/tomorrow), "transit" (shipped, not yet arriving), "pickup" (ready for pickup), "delivered", or "ordered" (not yet shipped)
- delivery: human-readable date string like "May 14", "Today", "Tomorrow", "May 16-21", or "TBD"
- deliverySort: number for sorting (0=today, 1=tomorrow, 2=this week, 3=later, 99=unknown)
- tracking: tracking number string or null. Look carefully in the email body for tracking numbers - they are often long strings of numbers like 1Z999AA10123456784 (UPS), 9400111899223397719185 (USPS), or similar. Extract the full tracking number.
- carrier: UPS/FedEx/USPS/DHL/Amazon/etc or null
- orderNumber: order/confirmation number or null

Return [] if no shipments found. No markdown, no explanation.`,
    messages: [{ role: "user", content: `Email data:\n\n${emailData}` }],
  });

  const text = msg.content[0].text.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const { code, token } = JSON.parse(event.body || "{}");
    const oauth2Client = getOAuthClient();

    if (code) {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const emailData = await getGmailMessages(oauth2Client);
      const packages = await extractPackages(emailData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ packages, tokens, scannedAt: new Date().toISOString() }),
      };
    }

    if (token) {
      oauth2Client.setCredentials(typeof token === "string" ? JSON.parse(token) : token);
      const emailData = await getGmailMessages(oauth2Client);
      const packages = await extractPackages(emailData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ packages, scannedAt: new Date().toISOString() }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing code or token" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
