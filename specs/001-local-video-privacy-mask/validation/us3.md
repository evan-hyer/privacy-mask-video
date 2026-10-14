# US3 implementation status

Code is implemented: 22 preset/custom supported sequences, bundled font
rasterization, invalid-configuration retention, masked preview ACK throttling,
progress/tracking UI, immediate cancellation/invalidation, worker termination,
resident-resource retry and cancel/reset controls available under disabled.

Testing was deferred by the user. No preview/export comparison, cancellation
latency measurement, race suite or forced offline retry was run. See final.md;
the original US3 acceptance checkpoint remains unverified.
