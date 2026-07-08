const { ParenthesesLicenceClient } = require("../src");

const client = new ParenthesesLicenceClient({ apiKey: process.env.PARENTHESES_API_KEY });

async function main() {
  const activations = await client.activations.list({ limit: 25 });
  console.log(`Known activations: ${activations.data.length}`);
}

main();
