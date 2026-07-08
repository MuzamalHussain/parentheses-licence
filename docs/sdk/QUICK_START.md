# SDK Quick Start

Create an API key in the admin API Keys area, grant the required scopes, and initialize a client with the server base URL.

```js
const { ParenthesesLicenceClient } = require("../sdk/javascript/src");

const client = new ParenthesesLicenceClient({
  apiKey: process.env.PARENTHESES_API_KEY,
  baseUrl: "https://your-license-server.example",
});
```

Use resource modules to access the Public REST API:

```js
const products = await client.products.list({ limit: 25 });
const orders = await client.orders.list({ page: 1, limit: 25 });
```
