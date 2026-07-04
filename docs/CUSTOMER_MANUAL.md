# Customer Manual

This manual describes the customer-facing portal experience.

## Registration

Open:

```text
https://app.blogpoint.net/register
```

Required fields:

- Name
- Email
- Password with at least 8 characters, one uppercase letter, and one number
- Optional company name

After registration, the system sends an email verification link through the configured SMTP provider.

## Login

Open:

```text
https://app.blogpoint.net/login
```

Login uses email and password. Sessions use an access token plus a secure refresh cookie. If too many failed attempts occur, the account is temporarily locked.

## Password Reset

Open:

```text
https://app.blogpoint.net/forgot-password
```

The reset email is sent if the account exists. The response intentionally does not reveal whether an email address is registered.

## Dashboard

Open:

```text
/dashboard
```

The dashboard summarizes:

- Total licenses
- Active licenses
- Active domains
- Licenses expiring in the next 30 days

## Browse Plans

Open:

```text
/dashboard/plans
```

Customers can view active products and plans, then start checkout using an enabled payment provider.

## Orders

Open:

```text
/dashboard/orders
```

Customers can view their own orders and status. Checkout redirects back to the orders page with order status query parameters.

## Licenses

Open:

```text
/dashboard/licenses
```

Customers can view:

- License key
- Product
- Plan
- Status
- Expiry
- Allowed sites
- Active sites

License statuses include:

- `active`
- `suspended`
- `revoked`
- `expired`

## Activated Sites

Domains are activated when the WordPress plugin calls the activation endpoint with a valid license key. The customer can deactivate a domain from the portal when they need to free a site slot.

Deactivation behavior:

- Removes the domain from the license.
- Frees one site slot.
- Records activation history.

## Downloads

Open:

```text
/dashboard/downloads
```

Customers can download published plugin versions only when they have an entitled active license.

Download behavior:

1. Customer requests a download.
2. Backend returns a short-lived single-use URL.
3. Browser downloads the ZIP.
4. The URL cannot be reused after successful download.

If a link expires or has already been used, request a new download.

## Support

Open:

```text
/dashboard/support
```

Customers can:

- Create a support ticket.
- Attach a ticket to a license when relevant.
- Reply to open or pending tickets.
- View ticket history.

Ticket statuses:

- `open`: support team needs to respond.
- `pending`: customer needs to respond.
- `closed`: issue is resolved.

## Account Safety

- Keep license keys private.
- Do not share download links; they are short-lived credentials.
- Use the deactivate-domain action before moving a license to a new site.
- Contact support if a license is suspended, revoked, expired, or has reached the site limit.
