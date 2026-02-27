use std::sync::{LazyLock, Mutex, Once};

const TEST_INTERNAL_AUTH_TOKEN: &str = "cp-internal-test-token";

static ENV_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static INIT: Once = Once::new();

pub fn ensure_test_security_env() {
    let _guard = ENV_LOCK.lock().expect("lock env");
    INIT.call_once(|| {
        std::env::set_var(
            "CONTROL_PLANE_INTERNAL_AUTH_TOKEN",
            TEST_INTERNAL_AUTH_TOKEN,
        );
    });
}
