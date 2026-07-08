<?php

namespace Parentheses\Licence;

class ParenthesesLicenceClient
{
    private string $apiKey;
    private string $baseUrl;
    private string $apiVersion;
    private int $timeoutSeconds;

    public function __construct(array $options)
    {
        if (empty($options['apiKey'])) {
            throw new \InvalidArgumentException('apiKey is required.');
        }
        $this->apiKey = $options['apiKey'];
        $this->baseUrl = rtrim($options['baseUrl'] ?? 'https://licence.example.com', '/');
        $this->apiVersion = $options['apiVersion'] ?? 'v1';
        $this->timeoutSeconds = $options['timeoutSeconds'] ?? 30;
    }

    public function listProducts(array $query = []): array
    {
        return $this->get('/products', $query);
    }

    public function listOrders(array $query = []): array
    {
        return $this->get('/orders', $query);
    }

    public function listLicenses(array $query = []): array
    {
        return $this->get('/licenses', $query);
    }

    public function listDownloads(array $query = []): array
    {
        return $this->get('/downloads', $query);
    }

    public function listActivations(array $query = []): array
    {
        return $this->get('/activations', $query);
    }

    public function validateKey(): array
    {
        return $this->get('/openapi');
    }

    private function get(string $path, array $query = []): array
    {
        $url = $this->baseUrl . '/api/public/' . $this->apiVersion . $path;
        if (!empty($query)) {
            $url .= '?' . http_build_query($query);
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $this->timeoutSeconds,
                'header' => implode("\r\n", [
                    'Authorization: Bearer ' . $this->apiKey,
                    'Accept: application/json',
                    'Content-Type: application/json',
                    'User-Agent: parentheses-licence-sdk-php/0.1.0',
                    'X-Parentheses-SDK-Version: 0.1.0',
                    'X-Parentheses-API-Version: ' . $this->apiVersion,
                ]),
            ],
        ]);

        $body = file_get_contents($url, false, $context);
        if ($body === false) {
            throw new \RuntimeException('Parentheses Licence API request failed.');
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Parentheses Licence API returned invalid JSON.');
        }
        if (($decoded['success'] ?? true) === false) {
            $error = $decoded['error'] ?? ['code' => 'API_ERROR', 'message' => 'API request failed.'];
            throw new \RuntimeException($error['code'] . ': ' . $error['message']);
        }
        return $decoded;
    }
}
