//! Conflux escrow contract — Stage 2A.
//!
//! Rules live in docs/CONTRACT.md; rule codes (A1, T3, S3, ...) are referenced
//! in comments below. Stage 2A covers: init, agent registration, task creation,
//! cancellation, and views. Assign / submit / approve / expire come later.

use near_sdk::json_types::U64;
use near_sdk::store::{IterableMap, Vector};
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, assert_one_yocto, env, near,
    require,
};

// ---- Limits (docs/CONTRACT.md) -------------------------------------------
pub const MAX_CAPABILITIES: usize = 10;
pub const MAX_CAPABILITY_LEN: usize = 32;
pub const MAX_SLOTS: usize = 10;
pub const MAX_ROLE_LEN: usize = 64;
pub const DEFAULT_PAGE_LIMIT: u32 = 20;
pub const MAX_PAGE_LIMIT: u32 = 50;

// ---- Data types ----------------------------------------------------------

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Agent {
    pub agent_id: AccountId,
    pub owner: AccountId,
    pub capabilities: Vec<String>,
    pub active: bool,
    pub registered_at: U64,
}

/// What the creator sends for each slot in `create_task`.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct SlotInput {
    pub role: String,
    pub reward: NearToken,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Slot {
    pub role: String,
    pub reward: NearToken,
    pub agent_id: Option<AccountId>,
    pub result_hash: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskStatus {
    Funded,
    InProgress,
    Submitted,
    Settled,
    Cancelled,
    Expired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Task {
    pub id: u64,
    pub creator: AccountId,
    pub description_hash: String,
    pub slots: Vec<Slot>,
    pub coordinator_fee: NearToken,
    /// Exactly sum(slot rewards) + coordinator_fee (rule T4).
    pub escrow: NearToken,
    pub status: TaskStatus,
    pub created_at: U64,
    /// Nanoseconds (rule T6).
    pub deadline: U64,
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Agents,
    Tasks,
}

// ---- Contract ------------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    coordinator: AccountId,
    agents: IterableMap<AccountId, Agent>,
    /// Task id == index in this vector.
    tasks: Vector<Task>,
}

#[near]
impl Contract {
    /// I1: set the single coordinator account. Can only run once
    /// (`#[init]` refuses if state already exists).
    #[init]
    pub fn init(coordinator: AccountId) -> Self {
        Self {
            coordinator,
            agents: IterableMap::new(StorageKey::Agents),
            tasks: Vector::new(StorageKey::Tasks),
        }
    }

    // ---- Agents ----------------------------------------------------------

    /// Register an agent owned by the caller. Caller pays storage (S1, S2).
    #[payable]
    pub fn register_agent(&mut self, agent_id: AccountId, capabilities: Vec<String>) -> Agent {
        let owner = env::predecessor_account_id();

        // A1: agent_id must be a sub-account of the caller.
        let suffix = format!(".{owner}");
        require!(
            agent_id.as_str().ends_with(&suffix),
            "agent_id must be a sub-account of the caller"
        );
        // A3: register once.
        require!(
            !self.agents.contains_key(&agent_id),
            "agent already registered"
        );
        // A5: capability limits.
        require!(
            capabilities.len() <= MAX_CAPABILITIES,
            "too many capabilities"
        );
        for c in &capabilities {
            require!(
                !c.is_empty() && c.len() <= MAX_CAPABILITY_LEN,
                "capability must be 1-32 chars"
            );
        }

        let agent = Agent {
            agent_id: agent_id.clone(),
            owner: owner.clone(), // A2
            capabilities,
            active: true, // A4
            registered_at: U64(env::block_timestamp()),
        };

        let before = env::storage_usage();
        self.agents.insert(agent_id, agent.clone());
        self.agents.flush(); // write now so storage usage can be measured
        let storage_cost = storage_cost_since(before);

        charge_and_refund(&owner, storage_cost);
        agent
    }

    /// A4: only the owner can switch an agent on/off.
    pub fn set_agent_active(&mut self, agent_id: AccountId, active: bool) {
        let caller = env::predecessor_account_id();
        let agent = self
            .agents
            .get_mut(&agent_id)
            .unwrap_or_else(|| env::panic_str("agent not found"));
        require!(agent.owner == caller, "only the agent owner can do this");
        agent.active = active;
    }

    pub fn get_agent(&self, agent_id: AccountId) -> Option<Agent> {
        self.agents.get(&agent_id).cloned()
    }

    pub fn get_agents(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Agent> {
        let (from, limit) = page(from_index, limit);
        self.agents
            .values()
            .skip(from as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }

    // ---- Tasks -----------------------------------------------------------

    /// Create a task and escrow its rewards + fee. Caller also pays storage;
    /// any excess deposit is refunded (S3).
    #[payable]
    pub fn create_task(
        &mut self,
        description_hash: String,
        slots: Vec<SlotInput>,
        coordinator_fee: NearToken,
        deadline: U64,
    ) -> Task {
        let creator = env::predecessor_account_id();

        // T1: 64-char lowercase hex (SHA-256). Never the full text.
        require!(
            description_hash.len() == 64
                && description_hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "description_hash must be 64 lowercase hex chars"
        );
        // T2: slot count and role length.
        require!(
            !slots.is_empty() && slots.len() <= MAX_SLOTS,
            "task must have 1-10 slots"
        );
        // T6: deadline in the future.
        require!(
            deadline.0 > env::block_timestamp(),
            "deadline must be in the future"
        );

        // T3 + T4: every reward > 0; escrow = sum(rewards) + fee, no overflow.
        let mut escrow = coordinator_fee;
        for s in &slots {
            require!(
                !s.role.is_empty() && s.role.len() <= MAX_ROLE_LEN,
                "role must be 1-64 chars"
            );
            require!(!s.reward.is_zero(), "slot reward must be greater than zero");
            escrow = escrow
                .checked_add(s.reward)
                .unwrap_or_else(|| env::panic_str("escrow overflow"));
        }

        let id = self.tasks.len() as u64;
        let task = Task {
            id,
            creator: creator.clone(),
            description_hash,
            slots: slots
                .into_iter()
                .map(|s| Slot {
                    role: s.role,
                    reward: s.reward,
                    agent_id: None,
                    result_hash: None,
                })
                .collect(),
            coordinator_fee,
            escrow,
            status: TaskStatus::Funded, // T5
            created_at: U64(env::block_timestamp()),
            deadline,
        };

        let before = env::storage_usage();
        self.tasks.push(task.clone());
        self.tasks.flush();
        let storage_cost = storage_cost_since(before);

        // S3: deposit >= escrow + storage; refund the rest.
        let required = escrow
            .checked_add(storage_cost)
            .unwrap_or_else(|| env::panic_str("deposit overflow"));
        charge_and_refund(&creator, required);
        task
    }

    /// C1–C3: creator only, only while Funded, full escrow refund.
    /// M1: requires exactly 1 yoctoNEAR attached (full-access key check).
    #[payable]
    pub fn cancel_task(&mut self, task_id: u64) -> Task {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let idx = u32::try_from(task_id).unwrap_or_else(|_| env::panic_str("task not found"));
        let task = self
            .tasks
            .get_mut(idx)
            .unwrap_or_else(|| env::panic_str("task not found"));
        require!(task.creator == caller, "only the task creator can cancel");
        require!(
            task.status == TaskStatus::Funded,
            "task can only be cancelled before any slot is assigned"
        );

        // Status changes first, then the refund is scheduled. Either way the
        // whole call is atomic: a panic rolls back both.
        task.status = TaskStatus::Cancelled;
        let refund = task.escrow;
        let result = task.clone();
        if !refund.is_zero() {
            Promise::new(caller).transfer(refund).detach();
        }
        result
    }

    pub fn get_task(&self, task_id: u64) -> Option<Task> {
        u32::try_from(task_id)
            .ok()
            .and_then(|i| self.tasks.get(i))
            .cloned()
    }

    pub fn get_tasks(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Task> {
        let (from, limit) = page(from_index, limit);
        let end = from.saturating_add(limit).min(self.tasks.len());
        (from..end)
            .filter_map(|i| self.tasks.get(i).cloned())
            .collect()
    }

    pub fn get_coordinator(&self) -> AccountId {
        self.coordinator.clone()
    }
}

// ---- Helpers -------------------------------------------------------------

/// Cost of the bytes added to storage since `before`.
fn storage_cost_since(before: u64) -> NearToken {
    let added = env::storage_usage().saturating_sub(before);
    env::storage_byte_cost().saturating_mul(added as u128)
}

/// Require attached deposit >= `required`; refund any excess to `to`.
/// A panic here rolls back every state change made in this call.
fn charge_and_refund(to: &AccountId, required: NearToken) {
    let attached = env::attached_deposit();
    require!(
        attached >= required,
        format!(
            "attached deposit too low: need {} yoctoNEAR, got {}",
            required.as_yoctonear(),
            attached.as_yoctonear()
        )
    );
    let excess = attached.saturating_sub(required);
    if !excess.is_zero() {
        Promise::new(to.clone()).transfer(excess).detach();
    }
}

fn page(from_index: Option<u32>, limit: Option<u32>) -> (u32, u32) {
    (
        from_index.unwrap_or(0),
        limit.unwrap_or(DEFAULT_PAGE_LIMIT).min(MAX_PAGE_LIMIT),
    )
}

// ---- Unit tests ----------------------------------------------------------
// Each test names the docs/CONTRACT.md rule it covers.

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::mock::MockAction;
    use near_sdk::test_utils::{VMContextBuilder, get_created_receipts};
    use near_sdk::testing_env;

    const NOW: u64 = 1_000_000_000_000_000_000; // ns
    const HOUR: u64 = 3_600_000_000_000; // ns

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn near(n: u128) -> NearToken {
        NearToken::from_near(n)
    }
    fn hash() -> String {
        "ab".repeat(32)
    }

    /// Set the caller and attached deposit for the next contract call.
    fn ctx(caller: &str, deposit: NearToken) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(acc("conflux.testnet"))
                .predecessor_account_id(acc(caller))
                .signer_account_id(acc(caller))
                .attached_deposit(deposit)
                .block_timestamp(NOW)
                .build()
        );
    }

    fn setup() -> Contract {
        ctx("deployer.testnet", NearToken::from_yoctonear(0));
        Contract::init(acc("coord.testnet"))
    }

    /// All NEAR transfers the last call scheduled: (receiver, amount).
    fn transfers() -> Vec<(AccountId, NearToken)> {
        get_created_receipts()
            .into_iter()
            .flat_map(|r| {
                let to = r.receiver_id.clone();
                r.actions.into_iter().filter_map(move |a| match a {
                    MockAction::Transfer { deposit, .. } => Some((to.clone(), deposit)),
                    _ => None,
                })
            })
            .collect()
    }

    fn slots(rewards: &[u128]) -> Vec<SlotInput> {
        rewards
            .iter()
            .enumerate()
            .map(|(i, r)| SlotInput {
                role: format!("role{i}"),
                reward: near(*r),
            })
            .collect()
    }

    /// alice creates a valid task: slots 2 + 3 NEAR, fee 1 NEAR, 1 NEAR extra for storage.
    fn alice_creates_task(c: &mut Contract) -> Task {
        ctx("alice.testnet", near(7));
        c.create_task(hash(), slots(&[2, 3]), near(1), U64(NOW + HOUR))
    }

    // ---- init (I1) -------------------------------------------------------

    #[test]
    fn i1_init_sets_coordinator() {
        let c = setup();
        assert_eq!(c.get_coordinator(), acc("coord.testnet"));
    }

    // ---- register_agent --------------------------------------------------

    #[test]
    fn a1_a2_a4_register_valid_subaccount() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        let a = c.register_agent(acc("writer.alice.testnet"), vec!["research".into()]);
        assert_eq!(a.owner, acc("alice.testnet")); // A2
        assert!(a.active); // A4
        assert_eq!(c.get_agent(acc("writer.alice.testnet")), Some(a));
    }

    #[test]
    fn a1_register_deeper_subaccount_ok() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("x.writer.alice.testnet"), vec![]);
    }

    #[test]
    #[should_panic(expected = "agent_id must be a sub-account of the caller")]
    fn a1_register_other_owners_subaccount_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.bob.testnet"), vec![]);
    }

    #[test]
    #[should_panic(expected = "agent_id must be a sub-account of the caller")]
    fn a1_register_self_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("alice.testnet"), vec![]);
    }

    #[test]
    #[should_panic(expected = "agent_id must be a sub-account of the caller")]
    fn a1_register_lookalike_suffix_fails() {
        // "writer.malice.testnet" ends with "alice.testnet" but not ".alice.testnet"
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.malice.testnet"), vec![]);
    }

    #[test]
    #[should_panic(expected = "agent already registered")]
    fn a3_register_duplicate_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec![]);
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec![]);
    }

    #[test]
    #[should_panic(expected = "too many capabilities")]
    fn a5_register_too_many_capabilities_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        let caps = (0..11).map(|i| format!("c{i}")).collect();
        c.register_agent(acc("writer.alice.testnet"), caps);
    }

    #[test]
    #[should_panic(expected = "capability must be 1-32 chars")]
    fn a5_register_capability_too_long_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec!["x".repeat(33)]);
    }

    #[test]
    #[should_panic(expected = "capability must be 1-32 chars")]
    fn a5_register_empty_capability_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec!["".into()]);
    }

    #[test]
    fn a5_register_exactly_at_limits_ok() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        let caps = (0..10).map(|_| "x".repeat(32)).collect();
        c.register_agent(acc("writer.alice.testnet"), caps);
    }

    #[test]
    fn s1_s2_register_charges_storage_and_refunds_excess() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        let before = env::storage_usage();
        c.register_agent(acc("writer.alice.testnet"), vec!["research".into()]);
        let bytes = env::storage_usage() - before;
        let cost = env::storage_byte_cost().saturating_mul(bytes as u128);
        assert!(bytes > 0);
        assert_eq!(
            transfers(),
            vec![(acc("alice.testnet"), near(1).saturating_sub(cost))]
        );
    }

    #[test]
    #[should_panic(expected = "attached deposit too low")]
    fn s2_register_without_storage_deposit_fails() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.register_agent(acc("writer.alice.testnet"), vec![]);
    }

    // ---- set_agent_active ------------------------------------------------

    #[test]
    fn a4_owner_can_set_active() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec![]);
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.set_agent_active(acc("writer.alice.testnet"), false);
        assert!(!c.get_agent(acc("writer.alice.testnet")).unwrap().active);
        c.set_agent_active(acc("writer.alice.testnet"), true);
        assert!(c.get_agent(acc("writer.alice.testnet")).unwrap().active);
    }

    #[test]
    #[should_panic(expected = "only the agent owner can do this")]
    fn a4_non_owner_cannot_set_active() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.register_agent(acc("writer.alice.testnet"), vec![]);
        ctx("bob.testnet", NearToken::from_yoctonear(0));
        c.set_agent_active(acc("writer.alice.testnet"), false);
    }

    #[test]
    #[should_panic(expected = "agent not found")]
    fn a4_set_active_unknown_agent_fails() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.set_agent_active(acc("ghost.alice.testnet"), false);
    }

    // ---- create_task -----------------------------------------------------

    #[test]
    fn t4_t5_create_valid_task() {
        let mut c = setup();
        let t = alice_creates_task(&mut c);
        assert_eq!(t.id, 0);
        assert_eq!(t.creator, acc("alice.testnet"));
        assert_eq!(t.escrow, near(6)); // 2 + 3 + fee 1
        assert_eq!(t.coordinator_fee, near(1));
        assert_eq!(t.status, TaskStatus::Funded);
        assert!(
            t.slots
                .iter()
                .all(|s| s.agent_id.is_none() && s.result_hash.is_none())
        );
        assert_eq!(t.description_hash, hash());
        assert_eq!(t.deadline, U64(NOW + HOUR));
        assert_eq!(c.get_task(0), Some(t));
    }

    #[test]
    fn s3_create_charges_escrow_plus_storage_and_refunds_excess() {
        let mut c = setup();
        ctx("alice.testnet", near(7));
        let before = env::storage_usage();
        let t = c.create_task(hash(), slots(&[2, 3]), near(1), U64(NOW + HOUR));
        let bytes = env::storage_usage() - before;
        let storage = env::storage_byte_cost().saturating_mul(bytes as u128);
        // 7 attached - 6 escrow - storage = refund
        let expected = near(7).saturating_sub(near(6)).saturating_sub(storage);
        assert_eq!(transfers(), vec![(acc("alice.testnet"), expected)]);
        assert_eq!(t.escrow, near(6)); // T4: storage not in escrow
    }

    #[test]
    fn t2_zero_fee_ok() {
        let mut c = setup();
        ctx("alice.testnet", near(2));
        let t = c.create_task(hash(), slots(&[1]), near(0), U64(NOW + HOUR));
        assert_eq!(t.escrow, near(1));
    }

    #[test]
    #[should_panic(expected = "attached deposit too low")]
    fn s3_deposit_equal_to_escrow_but_no_storage_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(6));
        c.create_task(hash(), slots(&[2, 3]), near(1), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "attached deposit too low")]
    fn s3_deposit_below_escrow_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(1));
        c.create_task(hash(), slots(&[2, 3]), near(1), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "slot reward must be greater than zero")]
    fn t3_zero_reward_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task(hash(), slots(&[2, 0]), near(1), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "escrow overflow")]
    fn t4_escrow_overflow_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        let s = vec![SlotInput {
            role: "r".into(),
            reward: NearToken::from_yoctonear(u128::MAX),
        }];
        c.create_task(hash(), s, NearToken::from_yoctonear(1), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "deadline must be in the future")]
    fn t6_past_deadline_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task(hash(), slots(&[1]), near(0), U64(NOW - HOUR));
    }

    #[test]
    #[should_panic(expected = "deadline must be in the future")]
    fn t6_deadline_equal_to_now_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task(hash(), slots(&[1]), near(0), U64(NOW));
    }

    #[test]
    #[should_panic(expected = "description_hash must be 64 lowercase hex chars")]
    fn t1_short_hash_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task("ab".repeat(31), slots(&[1]), near(0), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "description_hash must be 64 lowercase hex chars")]
    fn t1_uppercase_hash_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task("AB".repeat(32), slots(&[1]), near(0), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "description_hash must be 64 lowercase hex chars")]
    fn t1_plain_text_description_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        let text = "Write a market report on NEAR AI agents, 3 pages, sources cited.";
        assert_eq!(text.len(), 64);
        c.create_task(text.into(), slots(&[1]), near(0), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "task must have 1-10 slots")]
    fn t2_zero_slots_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        c.create_task(hash(), vec![], near(1), U64(NOW + HOUR));
    }

    #[test]
    #[should_panic(expected = "task must have 1-10 slots")]
    fn t2_eleven_slots_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(20));
        c.create_task(hash(), slots(&[1; 11]), near(0), U64(NOW + HOUR));
    }

    #[test]
    fn t2_ten_slots_ok() {
        let mut c = setup();
        ctx("alice.testnet", near(20));
        let t = c.create_task(hash(), slots(&[1; 10]), near(0), U64(NOW + HOUR));
        assert_eq!(t.slots.len(), 10);
        assert_eq!(t.escrow, near(10));
    }

    #[test]
    #[should_panic(expected = "role must be 1-64 chars")]
    fn t2_empty_role_fails() {
        let mut c = setup();
        ctx("alice.testnet", near(10));
        let s = vec![SlotInput {
            role: "".into(),
            reward: near(1),
        }];
        c.create_task(hash(), s, near(0), U64(NOW + HOUR));
    }

    // ---- cancel_task -----------------------------------------------------

    #[test]
    fn c1_c3_m2_creator_cancels_and_gets_full_escrow() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("alice.testnet", NearToken::from_yoctonear(1));
        let t = c.cancel_task(0);
        assert_eq!(t.status, TaskStatus::Cancelled);
        assert_eq!(c.get_task(0).unwrap().status, TaskStatus::Cancelled); // record kept
        assert_eq!(transfers(), vec![(acc("alice.testnet"), near(6))]);
    }

    #[test]
    #[should_panic(expected = "only the task creator can cancel")]
    fn c1_non_creator_cannot_cancel() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("bob.testnet", NearToken::from_yoctonear(1));
        c.cancel_task(0);
    }

    #[test]
    #[should_panic(expected = "only the task creator can cancel")]
    fn c1_coordinator_cannot_cancel() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("coord.testnet", NearToken::from_yoctonear(1));
        c.cancel_task(0);
    }

    #[test]
    #[should_panic(expected = "task can only be cancelled before any slot is assigned")]
    fn c2_second_cancel_fails() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("alice.testnet", NearToken::from_yoctonear(1));
        c.cancel_task(0);
        ctx("alice.testnet", NearToken::from_yoctonear(1));
        c.cancel_task(0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn m1_cancel_without_one_yocto_fails() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.cancel_task(0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn m1_cancel_with_two_yocto_fails() {
        let mut c = setup();
        alice_creates_task(&mut c);
        ctx("alice.testnet", NearToken::from_yoctonear(2));
        c.cancel_task(0);
    }

    #[test]
    #[should_panic(expected = "task not found")]
    fn c_cancel_unknown_task_fails() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(1));
        c.cancel_task(42);
    }

    // ---- views & pagination ---------------------------------------------

    #[test]
    fn get_agents_pagination() {
        let mut c = setup();
        let names = ["a", "b", "c", "d", "e"];
        for n in names {
            ctx("alice.testnet", near(1));
            c.register_agent(acc(&format!("{n}.alice.testnet")), vec![]);
        }
        let ids = |v: Vec<Agent>| -> Vec<String> {
            v.into_iter().map(|a| a.agent_id.to_string()).collect()
        };
        assert_eq!(
            ids(c.get_agents(Some(0), Some(2))),
            ["a.alice.testnet", "b.alice.testnet"]
        );
        assert_eq!(
            ids(c.get_agents(Some(2), Some(2))),
            ["c.alice.testnet", "d.alice.testnet"]
        );
        assert_eq!(ids(c.get_agents(Some(4), Some(2))), ["e.alice.testnet"]);
        assert!(c.get_agents(Some(10), Some(2)).is_empty());
        assert_eq!(c.get_agents(None, None).len(), 5);
        assert_eq!(c.get_agent(acc("zzz.alice.testnet")), None);
    }

    #[test]
    fn get_tasks_pagination() {
        let mut c = setup();
        for _ in 0..5 {
            alice_creates_task(&mut c);
        }
        let ids = |v: Vec<Task>| -> Vec<u64> { v.into_iter().map(|t| t.id).collect() };
        assert_eq!(ids(c.get_tasks(Some(0), Some(2))), [0, 1]);
        assert_eq!(ids(c.get_tasks(Some(2), Some(2))), [2, 3]);
        assert_eq!(ids(c.get_tasks(Some(4), Some(2))), [4]);
        assert!(c.get_tasks(Some(10), Some(2)).is_empty());
        assert_eq!(ids(c.get_tasks(None, None)), [0, 1, 2, 3, 4]);
        assert_eq!(c.get_task(99), None);
    }

    #[test]
    fn pagination_limit_is_capped() {
        let mut c = setup();
        for _ in 0..(MAX_PAGE_LIMIT + 5) {
            ctx("alice.testnet", near(3));
            c.create_task(hash(), slots(&[1]), near(0), U64(NOW + HOUR));
        }
        assert_eq!(c.get_tasks(None, Some(1000)).len(), MAX_PAGE_LIMIT as usize);
        assert_eq!(c.get_tasks(None, None).len(), DEFAULT_PAGE_LIMIT as usize);
    }
}
