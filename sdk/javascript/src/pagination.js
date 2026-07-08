class Page {
  constructor(client, path, params, response) {
    this.client = client;
    this.path = path;
    this.params = { ...(params || {}) };
    this.data = response.data || [];
    this.pagination = response.pagination || null;
  }

  hasNextPage() {
    return Boolean(this.pagination && this.pagination.page < this.pagination.pages);
  }

  hasPreviousPage() {
    return Boolean(this.pagination && this.pagination.page > 1);
  }

  async nextPage() {
    if (!this.hasNextPage()) return null;
    return this.client.requestPage(this.path, { ...this.params, page: this.pagination.page + 1 });
  }

  async previousPage() {
    if (!this.hasPreviousPage()) return null;
    return this.client.requestPage(this.path, { ...this.params, page: this.pagination.page - 1 });
  }

  async *autoPagination() {
    let page = this;
    while (page) {
      for (const item of page.data) yield item;
      page = await page.nextPage();
    }
  }
}

module.exports = { Page };
