#![cfg_attr(not(feature = "postgres-backend"), allow(dead_code, unused_imports))]

include!("tenant/types_and_runtime.rs");
include!("tenant/billing_core.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/auth_session.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/api_keys_credits.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/api_key_groups.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/admin_ops.rs");
include!("tenant/openai_catalog_sync.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/billing_reconcile.rs");
#[cfg(feature = "postgres-backend")]
include!("tenant/audit_and_utils.rs");
#[cfg(not(feature = "postgres-backend"))]
include!("tenant/no_postgres.rs");
