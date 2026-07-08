class Resource {
  constructor(client, basePath) {
    this.client = client;
    this.basePath = basePath;
  }

  list(params = {}) {
    return this.client.requestPage(this.basePath, params);
  }
}

class ProductsResource extends Resource {
  constructor(client) {
    super(client, "/products");
  }

  versions(productId, params = {}) {
    return this.client.requestPage(`/products/${encodeURIComponent(productId)}/versions`, params);
  }
}

class VersionsResource {
  constructor(client) {
    this.client = client;
  }

  listByProduct(productId, params = {}) {
    return this.client.products.versions(productId, params);
  }
}

class LicensesResource extends Resource {
  constructor(client) {
    super(client, "/licenses");
  }
}

class OrdersResource extends Resource {
  constructor(client) {
    super(client, "/orders");
  }
}

class DownloadsResource extends Resource {
  constructor(client) {
    super(client, "/downloads");
  }
}

class CustomersResource extends Resource {
  constructor(client) {
    super(client, "/customers");
  }
}

class PaymentsResource {
  constructor(client) {
    this.client = client;
  }

  history(params = {}) {
    return this.client.orders.list(params);
  }
}

class WebhooksResource {
  constructor(client) {
    this.client = client;
  }

  openApi() {
    return this.client.request("GET", "/openapi");
  }
}

class ActivationsResource extends Resource {
  constructor(client) {
    super(client, "/activations");
  }
}

module.exports = {
  ProductsResource,
  VersionsResource,
  LicensesResource,
  OrdersResource,
  DownloadsResource,
  CustomersResource,
  PaymentsResource,
  WebhooksResource,
  ActivationsResource,
};
