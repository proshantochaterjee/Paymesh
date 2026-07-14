use soroban_sdk::contracttype;

/// docs/PERMISSION_MODEL.md §1: Owner > Admin > {Finance, Hr} > Viewer,
/// with Finance and Hr deliberately incomparable to each other.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Owner,
    Admin,
    Finance,
    Hr,
    Viewer,
}

impl Role {
    /// Whether this role can, in principle, authorize outbound fund
    /// movement (deposits are permissionless and not gated by this check).
    pub fn can_move_funds(&self) -> bool {
        matches!(self, Role::Owner | Role::Admin | Role::Finance)
    }

    /// Mirrors organization's `has_at_least` check
    /// (docs/SMART_CONTRACT_SPECIFICATION.md §2 "Internal functions"):
    /// Finance and Hr each satisfy their own minimum and Viewer, but never
    /// substitute for one another, even though both outrank Viewer and are
    /// outranked by Admin/Owner.
    pub fn has_at_least(&self, minimum: &Role) -> bool {
        if self == minimum {
            return true;
        }
        match self {
            Role::Owner => true,
            Role::Admin => !matches!(minimum, Role::Owner),
            Role::Finance => matches!(minimum, Role::Viewer),
            Role::Hr => matches!(minimum, Role::Viewer),
            Role::Viewer => false,
        }
    }
}
