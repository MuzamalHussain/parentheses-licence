# Recovery Guide

Recovery should begin by entering maintenance or read-only mode, confirming incident scope, selecting the latest verified backup, validating restore scope, restoring resources in dependency order, and checking health endpoints.

Supported recovery plans include database failure, storage failure, queue failure, email failure, AI provider failure, and configuration failure.

Do not restore production data while writes are active unless the incident commander explicitly approves the procedure.
