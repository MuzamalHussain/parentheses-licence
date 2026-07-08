# Known Issues - Parentheses Licence 1.0.0

Generated: 2026-07-08T08:13:11.817Z

- Local filesystem plugin ZIP storage requires persistent volume or external backup on ephemeral hosts.
- Gateway refunds are recorded in-app, but issuing the external PSP/Stripe refund remains an operator action.
- Frontend bundle currently emits a Vite chunk-size warning; build succeeds.
- Frontend lint currently passes with React Compiler and hook dependency warnings.
- Secret settings are env-managed until encrypted settings storage exists.
