// Find NEAR documentation at https://docs.near.org
use near_sdk::{env, log, near};

// Define the contract structure
#[near(contract_state)]
pub struct Contract {
    greeting: String,
}

// Define the default, which automatically initializes the contract.
// Because of this, no `init` call is needed after deploying.
impl Default for Contract {
    fn default() -> Self {
        Self {
            greeting: "Hello".to_string(),
        }
    }
}

// Implement the contract functions
#[near]
impl Contract {
    /// Read-only view: returns the stored greeting. Free to call, no transaction needed.
    pub fn get_greeting(&self) -> String {
        self.greeting.clone()
    }

    /// Change method: stores a new greeting. Requires a signed transaction (costs gas).
    pub fn set_greeting(&mut self, greeting: String) {
        log!(
            "Saving greeting: {} (by {})",
            greeting,
            env::predecessor_account_id()
        );
        self.greeting = greeting;
    }
}

/*
 * The rest of this file holds the inline tests for the code above
 * Learn more about Rust tests: https://doc.rust-lang.org/book/ch11-01-writing-tests.html
 */
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_default_greeting() {
        let contract = Contract::default();
        assert_eq!(contract.get_greeting(), "Hello");
    }

    #[test]
    fn set_then_get_greeting() {
        let mut contract = Contract::default();
        contract.set_greeting("howdy".to_string());
        assert_eq!(contract.get_greeting(), "howdy");
    }
}
