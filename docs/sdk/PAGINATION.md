# SDK Pagination Guide

List endpoints return a `Page` object.

```js
const page = await client.products.list({ limit: 100 });
const next = await page.nextPage();
const previous = await page.previousPage();
```

Use `autoPagination()` to iterate through all pages:

```js
for await (const product of page.autoPagination()) {
  console.log(product.name);
}
```
