# Parentheses Licence PHP SDK Foundation

This PHP client is the foundation for future WordPress plugin integrations.

```php
$client = new Parentheses\Licence\ParenthesesLicenceClient([
    'apiKey' => getenv('PARENTHESES_API_KEY'),
    'baseUrl' => 'https://your-license-server.example',
]);

$products = $client->listProducts(['limit' => 50]);
```

Current foundation methods:

- `listProducts`
- `listOrders`
- `listLicenses`
- `listDownloads`
- `listActivations`
- `validateKey`

Package publishing and WordPress.org integration are intentionally deferred.
