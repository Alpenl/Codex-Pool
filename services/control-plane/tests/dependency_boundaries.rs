use std::process::Command;

#[test]
fn personal_dependency_tree_does_not_include_postgres_or_redis_backends() {
    let output = Command::new("cargo")
        .args([
            "tree",
            "-p",
            "control-plane",
            "--no-default-features",
            "-e",
            "normal",
            "-f",
            "{p}",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("run cargo tree");

    assert!(
        output.status.success(),
        "cargo tree failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        !stdout.contains("sqlx-postgres"),
        "personal dependency tree still includes sqlx-postgres:\n{stdout}"
    );
    assert!(
        !stdout.contains("redis v"),
        "personal dependency tree still includes redis:\n{stdout}"
    );
}
