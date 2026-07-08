const { ParenthesesLicenceClient } = require("../src");

const client = new ParenthesesLicenceClient({
  apiKey: process.env.PARENTHESES_API_KEY,
  baseUrl: process.env.PARENTHESES_BASE_URL,
});

async function main() {
  const licenses = await client.licenses.list({ limit: 10 });
  const match = licenses.data.find((license) => license.licenseKey === process.env.PARENTHESES_LICENSE_KEY);
  console.log(match ? "License found" : "License not found");
}

main().catch((err) => {
  console.error(err.code, err.message);
  process.exit(1);
});
