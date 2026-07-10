# Backup Guide

Back up MongoDB, uploaded plugin packages, configuration, organizations, licenses, orders, audit logs, and AI configuration.

Use managed MongoDB snapshots for production. Keep plugin ZIPs in persistent storage or object storage. Store sanitized configuration manifests separately from secrets.

The in-app disaster recovery center validates backup manifests, checksums, completeness, and restore readiness. Physical offsite backups should be operated by the deployment provider or future backup adapters.
