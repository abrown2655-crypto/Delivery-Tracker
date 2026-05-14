const { google } = require("googleapis");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

exports.handler = async (event) => {
  const { code } = event.queryStringParameters || {};

  if (!code) {
    return {
      statusCode: 302,
      headers: { Location: "/?error=no_code" },
    };
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const tokenEncoded = encodeURIComponent(JSON.stringify(tokens));
    return {
      statusCode: 302,
      headers: { Location: `/?token=${tokenEncoded}` },
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: `/?error=${encodeURIComponent(err.message)}` },
    };
  }
};
