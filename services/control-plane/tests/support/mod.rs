use base64::Engine;
use std::sync::{LazyLock, Mutex, Once};

const TEST_ADMIN_USERNAME: &str = "admin";
const TEST_ADMIN_PASSWORD: &str = "admin123456";
const TEST_ADMIN_JWT_SECRET: &str = "control-plane-test-jwt-secret";
const TEST_INTERNAL_AUTH_TOKEN: &str = "cp-internal-test-token";

static ENV_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static INIT: Once = Once::new();

pub fn ensure_test_security_env() {
    let _guard = ENV_LOCK.lock().expect("lock env");
    INIT.call_once(|| {
        std::env::set_var("ADMIN_USERNAME", TEST_ADMIN_USERNAME);
        std::env::set_var("ADMIN_PASSWORD", TEST_ADMIN_PASSWORD);
        std::env::set_var("ADMIN_JWT_SECRET", TEST_ADMIN_JWT_SECRET);
        std::env::set_var(
            "CONTROL_PLANE_INTERNAL_AUTH_TOKEN",
            TEST_INTERNAL_AUTH_TOKEN,
        );
        let hmac_key = base64::engine::general_purpose::STANDARD.encode([7_u8; 32]);
        std::env::set_var(
            "CONTROL_PLANE_API_KEY_HMAC_KEYS",
            format!("test:{hmac_key}"),
        );
    });
}

#[allow(dead_code)]
pub fn internal_service_token() -> String {
    ensure_test_security_env();
    TEST_INTERNAL_AUTH_TOKEN.to_string()
}
