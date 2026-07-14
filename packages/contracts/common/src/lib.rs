#![no_std]

mod error;
mod role;

pub mod clients;
pub mod events;
pub mod keys;
pub mod types;

pub use error::WorkforceError;
pub use role::Role;
pub use types::{EmployeeRecord, OrgRecord, PayFrequency};

#[cfg(test)]
mod test_keys;
#[cfg(test)]
mod test_role;
