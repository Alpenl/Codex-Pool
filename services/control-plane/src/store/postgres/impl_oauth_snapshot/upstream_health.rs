impl PostgresStore {
    async fn mark_account_seen_ok_inner(
        &self,
        account_id: Uuid,
        seen_ok_at: DateTime<Utc>,
        min_write_interval_sec: i64,
    ) -> Result<bool> {
        let threshold = seen_ok_at - Duration::seconds(min_write_interval_sec.max(0));
        let result = sqlx::query(
            r#"
            INSERT INTO upstream_account_health_state (
                account_id,
                seen_ok_at,
                created_at,
                updated_at
            )
            SELECT
                a.id,
                $2,
                now(),
                now()
            FROM upstream_accounts a
            WHERE a.id = $1
            ON CONFLICT (account_id) DO UPDATE
            SET
                seen_ok_at = GREATEST(
                    COALESCE(upstream_account_health_state.seen_ok_at, EXCLUDED.seen_ok_at),
                    EXCLUDED.seen_ok_at
                ),
                updated_at = now()
            WHERE
                upstream_account_health_state.seen_ok_at IS NULL
                OR upstream_account_health_state.seen_ok_at <= $3
            "#,
        )
        .bind(account_id)
        .bind(seen_ok_at)
        .bind(threshold)
        .execute(&self.pool)
        .await
        .context("failed to persist seen_ok signal")?;

        Ok(result.rows_affected() > 0)
    }
}
