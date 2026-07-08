const { ParenthesesLicenceClient } = require("../src");

const client = new ParenthesesLicenceClient({ apiKey: process.env.PARENTHESES_API_KEY });

async function main() {
  const products = await client.products.list({ limit: 50 });
  for await (const product of products.autoPagination()) {
    console.log(product.name);
  }
}

main();
