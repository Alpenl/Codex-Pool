use control_plane::contracts::{
    CreateTenantRequest, OAuthImportJobSummary, UpsertRoutingProfileRequest,
    UsageSummaryQueryResponse,
};

#[test]
fn control_plane_contracts_surface_exposes_moved_dtos() {
    let _ = std::mem::size_of::<CreateTenantRequest>();
    let _ = std::mem::size_of::<UpsertRoutingProfileRequest>();
    let _ = std::mem::size_of::<OAuthImportJobSummary>();
    let _ = std::mem::size_of::<UsageSummaryQueryResponse>();
}
