use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root")
}

fn script_path(relative: &str) -> PathBuf {
    repo_root().join(relative)
}

fn script_is_shell_valid(path: &Path) -> (bool, String) {
    let output = Command::new("bash")
        .arg("-n")
        .arg(path)
        .output()
        .expect("bash -n should run");
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    (output.status.success(), stderr)
}

#[test]
fn restart_backend_dev_script_is_present_and_shell_valid() {
    let path = script_path("scripts/restart_backend_dev.sh");
    assert!(path.exists(), "missing script: {}", path.display());
    let (ok, stderr) = script_is_shell_valid(&path);
    assert!(ok, "shell parse failed for {}: {stderr}", path.display());
}

#[test]
fn restart_backend_dev_script_uses_current_control_plane_bins_and_runtime_env() {
    let path = script_path("scripts/restart_backend_dev.sh");
    let script = fs::read_to_string(&path).expect("restart script should be readable");

    assert!(
        !script.contains("--bin control-plane"),
        "restart script should not reference removed control-plane bin: {}",
        path.display()
    );
    assert!(
        script.contains("codex-pool-personal")
            && script.contains("codex-pool-team")
            && script.contains("codex-pool-business"),
        "restart script should map editions to current product bins: {}",
        path.display()
    );
    assert!(
        script.contains(".env.runtime"),
        "restart script should source .env.runtime before relaunching backends: {}",
        path.display()
    );
}

#[test]
fn ai_error_learning_real_e2e_defaults_to_skip_until_env_gate_enabled() {
    let path = script_path("scripts/run_real_ai_error_learning_e2e.sh");
    assert!(path.exists(), "missing script: {}", path.display());
    let (ok, stderr) = script_is_shell_valid(&path);
    assert!(ok, "shell parse failed for {}: {stderr}", path.display());

    let output = Command::new("bash")
        .arg(&path)
        .env_remove("RUN_REAL_AI_ERROR_E2E")
        .output()
        .expect("real e2e script should run");

    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        output.status.success(),
        "expected skip exit 0, got {:?}: {combined}",
        output.status.code()
    );
    assert!(
        combined.contains("PASS-SKIP"),
        "expected PASS-SKIP marker when gate is off, got: {combined}"
    );
}

#[test]
fn ai_error_learning_real_e2e_runs_live_flow_when_env_gate_enabled() {
    if std::env::var("RUN_REAL_AI_ERROR_E2E").as_deref() != Ok("1") {
        return;
    }

    let path = script_path("scripts/run_real_ai_error_learning_e2e.sh");
    assert!(path.exists(), "missing script: {}", path.display());

    let output = Command::new("bash")
        .arg(&path)
        .env("RUN_REAL_AI_ERROR_E2E", "1")
        .output()
        .expect("real e2e script should run with gate enabled");

    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        output.status.success(),
        "expected live e2e to pass, got {:?}: {combined}",
        output.status.code()
    );
    assert!(
        combined.contains("[ai_error_learning_real_e2e] PASS"),
        "expected PASS marker for live e2e, got: {combined}"
    );
}
