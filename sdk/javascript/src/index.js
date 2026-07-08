const { RequestEngine } = require("./request");
const {
  ProductsResource,
  VersionsResource,
  LicensesResource,
  OrdersResource,
  DownloadsResource,
  CustomersResource,
  PaymentsResource,
  WebhooksResource,
  ActivationsResource,
} = require("./resources");
const errors = require("./errors");

const SDK_VERSION = "0.1.0";
const DEFAULT_API_VERSION = "v1";

class ParenthesesLicenceClient extends RequestEngine {
  constructor(options = {}) {
    super({ ...options, sdkVersion: options.sdkVersion || SDK_VERSION });
    this.compatibility = {
      sdkVersion: this.sdkVersion,
      apiVersion: this.apiVersion,
      supports: ["products", "versions", "licenses", "orders", "downloads", "customers", "payments", "webhooks", "activations"],
    };
    this.products = new ProductsResource(this);
    this.versions = new VersionsResource(this);
    this.licenses = new LicensesResource(this);
    this.orders = new OrdersResource(this);
    this.downloads = new DownloadsResource(this);
    this.customers = new CustomersResource(this);
    this.payments = new PaymentsResource(this);
    this.webhooks = new WebhooksResource(this);
    this.activations = new ActivationsResource(this);
  }

  validateKey() {
    return this.request("GET", "/openapi");
  }
}

module.exports = {
  ParenthesesLicenceClient,
  SDK_VERSION,
  DEFAULT_API_VERSION,
  ...errors,
};
