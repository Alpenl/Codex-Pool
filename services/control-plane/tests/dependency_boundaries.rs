use std::process::Command;

fn cargo_tree_output(args: &[&str]) -> String {
    let output = Command::new("cargo")
        .args(args)
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("run cargo tree");

    assert!(
        output.status.success(),
        "cargo tree failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    String::from_utf8_lossy(&output.stdout).into_owned()
}

#[test]
fn personal_dependency_tree_does_not_include_postgres_redis_clickhouse_or_smtp_backends() {
    let stdout = cargo_tree_output(&[
        "tree",
        "-p",
        "control-plane",
        "--no-default-features",
        "--features",
        "sqlite-backend",
        "-e",
        "normal",
        "-f",
        "{p}",
    ]);

    assert!(
        !stdout.contains("sqlx-postgres"),
        "personal dependency tree still includes sqlx-postgres:\n{stdout}"
    );
    assert!(
        !stdout.contains("redis v"),
        "personal dependency tree still includes redis:\n{stdout}"
    );
    assert!(
        !stdout.contains("clickhouse v"),
        "personal dependency tree still includes clickhouse:\n{stdout}"
    );
    assert!(
        !stdout.contains("lettre v"),
        "personal dependency tree still includes lettre:\n{stdout}"
    );
}

#[test]
fn team_dependency_tree_does_not_include_redis_clickhouse_or_smtp_backends() {
    let stdout = cargo_tree_output(&[
        "tree",
        "-p",
        "control-plane",
        "--no-default-features",
        "--features",
        "postgres-backend",
        "-e",
        "normal",
        "-f",
        "{p}",
    ]);

    assert!(
        stdout.contains("sqlx-postgres"),
        "team dependency tree should include sqlx-postgres:\n{stdout}"
    );
    assert!(
        !stdout.contains("redis v"),
        "team dependency tree still includes redis:\n{stdout}"
    );
    assert!(
        !stdout.contains("clickhouse v"),
        "team dependency tree still includes clickhouse:\n{stdout}"
    );
    assert!(
        !stdout.contains("lettre v"),
        "team dependency tree still includes lettre:\n{stdout}"
    );
}
