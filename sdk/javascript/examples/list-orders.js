const { ParenthesesLicenceClient } = require("../src");

const client = new ParenthesesLicenceClient({ apiKey: process.env.PARENTHESES_API_KEY });

async function main() {
  const orders = await client.orders.list({ limit: 20 });
  console.log(orders.data.map((order) => order.orderNumber));
}

main();
