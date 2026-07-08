const { ParenthesesLicenceClient } = require("../src");

const client = new ParenthesesLicenceClient({ apiKey: process.env.PARENTHESES_API_KEY });

async function main() {
  const downloads = await client.downloads.list({ limit: 10 });
  console.log(downloads.data.map((download) => download.filename || download.file));
}

main();
