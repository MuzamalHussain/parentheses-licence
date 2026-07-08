<?php

require __DIR__ . '/../src/ParenthesesLicenceClient.php';

use Parentheses\Licence\ParenthesesLicenceClient;

$client = new ParenthesesLicenceClient([
    'apiKey' => getenv('PARENTHESES_API_KEY'),
    'baseUrl' => getenv('PARENTHESES_BASE_URL') ?: 'https://licence.example.com',
]);

$products = $client->listProducts(['limit' => 50]);
print_r($products['data']);
