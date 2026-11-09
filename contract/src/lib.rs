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
pub const MAX_ROLE_LEN: usize = 32;
pub const MAX_PROOF_REF_LEN: usize = 256;
/// P2: how long after the last submission anyone may release payment (24h, ns).
pub const REVIEW_PERIOD: u64 = 24 * 60 * 60 * 1_000_000_000;
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
    pub completed_contributions: u64,
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
    pub proof_ref: Option<String>,
    pub submitted_at: Option<U64>,
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
    /// Set when the last slot is submitted (U6).
    pub submitted_at: Option<U64>,
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
            completed_contributions: 0,
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
            is_hex64(&description_hash),
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
                "role must be 1-32 chars"
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
                    proof_ref: None,
                    submitted_at: None,
                })
                .collect(),
            coordinator_fee,
            escrow,
            status: TaskStatus::Funded, // T5
            created_at: U64(env::block_timestamp()),
            deadline,
            submitted_at: None,
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
        transfer(&caller, refund);
        result
    }

    // ---- Stage 2B: assign / submit / pay / expire ---------------------------

    /// G1–G8: coordinator assigns (or reassigns) an agent to a slot.
    pub fn assign_slot(&mut self, task_id: u64, slot_index: u32, agent_id: AccountId) -> Task {
        require!(
            env::predecessor_account_id() == self.coordinator,
            "only the coordinator can assign slots"
        ); // G1
        let agent = self
            .agents
            .get(&agent_id)
            .unwrap_or_else(|| env::panic_str("agent not found"));
        require!(agent.active, "agent is not active"); // G5
        let capabilities = agent.capabilities.clone();

        let task = self.task_mut(task_id);
        require!(
            matches!(task.status, TaskStatus::Funded | TaskStatus::InProgress),
            "task is not open for assignment"
        ); // G2
        require!(
            env::block_timestamp() < task.deadline.0,
            "task deadline has passed"
        ); // G3
        let slot = task
            .slots
            .get_mut(slot_index as usize)
            .unwrap_or_else(|| env::panic_str("slot not found")); // G4
        require!(
            capabilities.contains(&slot.role),
            "agent does not have the slot's role in its capabilities"
        ); // G5
        require!(slot.result_hash.is_none(), "slot already submitted"); // G6
        slot.agent_id = Some(agent_id);
        task.status = TaskStatus::InProgress; // G7
        task.clone()
    }

    /// U1–U7: the assigned agent account submits its result for a slot.
    pub fn submit_contribution(
        &mut self,
        task_id: u64,
        slot_index: u32,
        result_hash: String,
        proof_ref: Option<String>,
    ) -> Task {
        let caller = env::predecessor_account_id();
        require!(
            is_hex64(&result_hash),
            "result_hash must be 64 lowercase hex chars"
        ); // U4
        if let Some(p) = &proof_ref {
            require!(
                p.len() <= MAX_PROOF_REF_LEN,
                "proof_ref must be at most 256 chars"
            );
        }
        let now = env::block_timestamp();

        let task = self.task_mut(task_id);
        require!(
            task.status == TaskStatus::InProgress,
            "task is not in progress"
        ); // U2
        require!(now < task.deadline.0, "task deadline has passed"); // U2
        let slot = task
            .slots
            .get_mut(slot_index as usize)
            .unwrap_or_else(|| env::panic_str("slot not found"));
        require!(
            slot.agent_id.as_ref() == Some(&caller),
            "only the slot's assigned agent can submit"
        ); // U1
        require!(slot.result_hash.is_none(), "slot already submitted"); // U3
        slot.result_hash = Some(result_hash);
        slot.proof_ref = proof_ref;
        slot.submitted_at = Some(U64(now)); // U5

        if task.slots.iter().all(|s| s.result_hash.is_some()) {
            task.status = TaskStatus::Submitted; // U6
            task.submitted_at = Some(U64(now));
        }
        task.clone()
    }

    /// P1, P3: creator approves a fully submitted task.
    #[payable]
    pub fn approve_task(&mut self, task_id: u64) -> Task {
        assert_one_yocto(); // M1
        let caller = env::predecessor_account_id();
        let task = self.task_mut(task_id);
        require!(task.creator == caller, "only the task creator can approve");
        require!(
            task.status == TaskStatus::Submitted,
            "task is not submitted"
        );
        self.settle(task_id)
    }

    /// P2, P3: anyone releases payment once the review period has passed.
    #[payable]
    pub fn release_payment(&mut self, task_id: u64) -> Task {
        assert_one_yocto(); // M1
        let task = self.task_mut(task_id);
        require!(
            task.status == TaskStatus::Submitted,
            "task is not submitted"
        );
        let submitted_at = task
            .submitted_at
            .expect("submitted task has submitted_at")
            .0;
        require!(
            env::block_timestamp() >= submitted_at.saturating_add(REVIEW_PERIOD),
            "review period has not passed"
        );
        self.settle(task_id)
    }

    /// E1–E3: creator expires an unfinished task after its deadline.
    #[payable]
    pub fn expire_task(&mut self, task_id: u64) -> Task {
        assert_one_yocto(); // M1
        let caller = env::predecessor_account_id();
        let task = self.task_mut(task_id);
        require!(task.creator == caller, "only the task creator can expire");
        require!(
            matches!(task.status, TaskStatus::Funded | TaskStatus::InProgress),
            "task cannot be expired in its current status"
        ); // E2
        require!(
            env::block_timestamp() >= task.deadline.0,
            "task deadline has not passed"
        ); // E1
        task.status = TaskStatus::Expired; // M2: status before transfers
        let task = task.clone();

        let paid = self.pay_submitted_slots(&task);
        let refund = task
            .escrow
            .checked_sub(paid)
            .unwrap_or_else(|| env::panic_str("payout exceeds escrow"));
        transfer(&task.creator, refund);
        task
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

// ---- Internal --------------------------------------------------------------

impl Contract {
    fn task_mut(&mut self, task_id: u64) -> &mut Task {
        u32::try_from(task_id)
            .ok()
            .and_then(|i| self.tasks.get_mut(i))
            .unwrap_or_else(|| env::panic_str("task not found"))
    }

    /// P3: mark Settled, then pay every slot's owner and the coordinator fee.
    fn settle(&mut self, task_id: u64) -> Task {
        let task = self.task_mut(task_id);
        task.status = TaskStatus::Settled; // M2: status before transfers
        let task = task.clone();
        let paid = self.pay_submitted_slots(&task);
        require!(
            paid.checked_add(task.coordinator_fee) == Some(task.escrow),
            "payout must equal escrow"
        ); // X1
        let coordinator = self.coordinator.clone();
        transfer(&coordinator, task.coordinator_fee);
        task
    }

    /// Pay each submitted slot's reward to its agent's owner; bump
    /// completed_contributions. Returns the total paid.
    fn pay_submitted_slots(&mut self, task: &Task) -> NearToken {
        let mut paid = NearToken::from_yoctonear(0);
        for slot in task.slots.iter().filter(|s| s.result_hash.is_some()) {
            let agent_id = slot.agent_id.as_ref().expect("submitted slot has an agent");
            let agent = self
                .agents
                .get_mut(agent_id)
                .unwrap_or_else(|| env::panic_str("agent not found"));
            agent.completed_contributions += 1;
            let owner = agent.owner.clone();
            transfer(&owner, slot.reward);
            paid = paid.saturating_add(slot.reward);
        }
        paid
    }
}

// ---- Helpers -------------------------------------------------------------

/// Schedule a transfer; zero amounts are skipped.
fn transfer(to: &AccountId, amount: NearToken) {
    if !amount.is_zero() {
        Promise::new(to.clone()).transfer(amount).detach();
    }
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

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
    transfer(to, attached.saturating_sub(required));
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
        ctx_at(caller, deposit, NOW);
    }

    /// Same as `ctx` but at a chosen block timestamp.
    fn ctx_at(caller: &str, deposit: NearToken, ts: u64) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(acc("conflux.testnet"))
                .predecessor_account_id(acc(caller))
                .signer_account_id(acc(caller))
                .attached_deposit(deposit)
                .block_timestamp(ts)
                .build()
        );
    }

    fn setup() -> Contract {
        // Start from empty storage (the mock otherwise carries it over).
        near_sdk::mock::with_mocked_blockchain(|b| {
            b.take_storage();
        });
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
    #[should_panic(expected = "role must be 1-32 chars")]
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

    // ======================================================================
    // Stage 2B
    // ======================================================================

    const DEADLINE: u64 = NOW + HOUR;
    fn yocto(n: u128) -> NearToken {
        NearToken::from_yoctonear(n)
    }
    fn rhash() -> String {
        "cd".repeat(32)
    }

    /// Agents: bob owns res.bob (research) and wri.bob (writing),
    /// carol owns res.carol (research).
    /// Task 0 by alice: slot 0 research 2 NEAR, slot 1 writing 3 NEAR, fee 1 NEAR.
    fn world() -> Contract {
        let mut c = setup();
        for (owner, id, cap) in [
            ("bob.testnet", "res.bob.testnet", "research"),
            ("bob.testnet", "wri.bob.testnet", "writing"),
            ("carol.testnet", "res.carol.testnet", "research"),
        ] {
            ctx(owner, near(1));
            c.register_agent(acc(id), vec![cap.into()]);
        }
        ctx("alice.testnet", near(7));
        let mut s = slots(&[2, 3]);
        s[0].role = "research".into();
        s[1].role = "writing".into();
        c.create_task(hash(), s, near(1), U64(DEADLINE));
        c
    }

    fn assign(c: &mut Contract, slot: u32, agent: &str) -> Task {
        ctx("coord.testnet", yocto(0));
        c.assign_slot(0, slot, acc(agent))
    }

    fn submit(c: &mut Contract, slot: u32, agent: &str) -> Task {
        ctx(agent, yocto(0));
        c.submit_contribution(0, slot, rhash(), None)
    }

    /// Both slots assigned to bob's agents and submitted at NOW.
    fn submitted_world() -> Contract {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 1, "wri.bob.testnet");
        c
    }

    fn total_out() -> NearToken {
        transfers()
            .into_iter()
            .fold(yocto(0), |acc, (_, a)| acc.saturating_add(a))
    }

    fn completed(c: &Contract, agent: &str) -> u64 {
        c.get_agent(acc(agent)).unwrap().completed_contributions
    }

    // ---- assign_slot -----------------------------------------------------

    #[test]
    fn g7_assign_sets_in_progress() {
        let mut c = world();
        let t = assign(&mut c, 0, "res.bob.testnet");
        assert_eq!(t.status, TaskStatus::InProgress);
        assert_eq!(t.slots[0].agent_id, Some(acc("res.bob.testnet")));
        assert_eq!(t.slots[1].agent_id, None);
    }

    #[test]
    #[should_panic(expected = "only the coordinator can assign slots")]
    fn g1_creator_cannot_assign() {
        let mut c = world();
        ctx("alice.testnet", yocto(0));
        c.assign_slot(0, 0, acc("res.bob.testnet"));
    }

    #[test]
    #[should_panic(expected = "only the coordinator can assign slots")]
    fn g1_agent_owner_cannot_assign() {
        let mut c = world();
        ctx("bob.testnet", yocto(0));
        c.assign_slot(0, 0, acc("res.bob.testnet"));
    }

    #[test]
    #[should_panic(expected = "agent is not active")]
    fn g5_assign_inactive_agent_fails() {
        let mut c = world();
        ctx("bob.testnet", yocto(0));
        c.set_agent_active(acc("res.bob.testnet"), false);
        assign(&mut c, 0, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "agent does not have the slot's role in its capabilities")]
    fn g5_assign_wrong_capability_fails() {
        let mut c = world();
        assign(&mut c, 0, "wri.bob.testnet"); // writer into research slot
    }

    #[test]
    #[should_panic(expected = "agent not found")]
    fn g5_assign_unregistered_agent_fails() {
        let mut c = world();
        assign(&mut c, 0, "ghost.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "slot not found")]
    fn g4_assign_bad_slot_index_fails() {
        let mut c = world();
        assign(&mut c, 2, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "task not found")]
    fn g_assign_unknown_task_fails() {
        let mut c = world();
        ctx("coord.testnet", yocto(0));
        c.assign_slot(9, 0, acc("res.bob.testnet"));
    }

    #[test]
    #[should_panic(expected = "task deadline has passed")]
    fn g3_assign_at_deadline_fails() {
        let mut c = world();
        ctx_at("coord.testnet", yocto(0), DEADLINE);
        c.assign_slot(0, 0, acc("res.bob.testnet"));
    }

    #[test]
    #[should_panic(expected = "task is not open for assignment")]
    fn g2_assign_on_cancelled_task_fails() {
        let mut c = world();
        ctx("alice.testnet", yocto(1));
        c.cancel_task(0);
        assign(&mut c, 0, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "task is not open for assignment")]
    fn g2_assign_on_submitted_task_fails() {
        let mut c = submitted_world();
        assign(&mut c, 0, "res.carol.testnet");
    }

    #[test]
    fn g6_reassign_unsubmitted_slot_ok_and_old_agent_locked_out() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        let t = assign(&mut c, 0, "res.carol.testnet");
        assert_eq!(t.slots[0].agent_id, Some(acc("res.carol.testnet")));
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            submit(&mut c, 0, "res.bob.testnet");
        }));
        assert!(r.is_err(), "old agent must not be able to submit");
    }

    #[test]
    #[should_panic(expected = "slot already submitted")]
    fn g6_reassign_submitted_slot_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 0, "res.carol.testnet");
    }

    #[test]
    fn g8_one_agent_can_hold_two_slots() {
        let mut c = world();
        ctx("bob.testnet", near(1));
        c.register_agent(
            acc("multi.bob.testnet"),
            vec!["research".into(), "writing".into()],
        );
        assign(&mut c, 0, "multi.bob.testnet");
        let t = assign(&mut c, 1, "multi.bob.testnet");
        assert!(
            t.slots
                .iter()
                .all(|s| s.agent_id == Some(acc("multi.bob.testnet")))
        );
    }

    #[test]
    #[should_panic(expected = "task can only be cancelled before any slot is assigned")]
    fn c2_creator_cannot_cancel_after_assign() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx("alice.testnet", yocto(1));
        c.cancel_task(0);
    }

    // ---- submit_contribution ---------------------------------------------

    #[test]
    fn u5_u6_submit_records_times_and_completes_task() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");

        ctx_at("res.bob.testnet", yocto(0), NOW + 10);
        let t = c.submit_contribution(0, 0, rhash(), Some("ipfs://proof".into()));
        assert_eq!(t.status, TaskStatus::InProgress);
        assert_eq!(t.slots[0].result_hash, Some(rhash()));
        assert_eq!(t.slots[0].proof_ref, Some("ipfs://proof".into()));
        assert_eq!(t.slots[0].submitted_at, Some(U64(NOW + 10)));
        assert_eq!(t.submitted_at, None);

        ctx_at("wri.bob.testnet", yocto(0), NOW + 20);
        let t = c.submit_contribution(0, 1, rhash(), None);
        assert_eq!(t.status, TaskStatus::Submitted);
        assert_eq!(t.submitted_at, Some(U64(NOW + 20)));
        assert_eq!(t.slots[1].submitted_at, Some(U64(NOW + 20)));
    }

    #[test]
    #[should_panic(expected = "only the slot's assigned agent can submit")]
    fn u1_submit_by_non_assigned_agent_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 0, "res.carol.testnet");
    }

    #[test]
    #[should_panic(expected = "only the slot's assigned agent can submit")]
    fn u1_submit_by_owner_instead_of_agent_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 0, "bob.testnet");
    }

    #[test]
    #[should_panic(expected = "only the slot's assigned agent can submit")]
    fn u1_submit_to_unassigned_slot_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 1, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "task is not in progress")]
    fn u2_submit_on_funded_task_fails() {
        let mut c = world();
        submit(&mut c, 0, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "slot already submitted")]
    fn u3_submit_twice_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 0, "res.bob.testnet");
    }

    #[test]
    #[should_panic(expected = "task deadline has passed")]
    fn u2_submit_after_deadline_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx_at("res.bob.testnet", yocto(0), DEADLINE);
        c.submit_contribution(0, 0, rhash(), None);
    }

    #[test]
    #[should_panic(expected = "result_hash must be 64 lowercase hex chars")]
    fn u4_bad_result_hash_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx("res.bob.testnet", yocto(0));
        c.submit_contribution(0, 0, "not-a-hash".into(), None);
    }

    #[test]
    #[should_panic(expected = "proof_ref must be at most 256 chars")]
    fn u4_proof_ref_too_long_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx("res.bob.testnet", yocto(0));
        c.submit_contribution(0, 0, rhash(), Some("p".repeat(257)));
    }

    #[test]
    fn u4_proof_ref_at_limit_ok() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx("res.bob.testnet", yocto(0));
        c.submit_contribution(0, 0, rhash(), Some("p".repeat(256)));
    }

    #[test]
    fn u7_deactivated_agent_can_still_submit_and_get_paid() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        ctx("bob.testnet", yocto(0));
        c.set_agent_active(acc("res.bob.testnet"), false);
        submit(&mut c, 0, "res.bob.testnet");
        submit(&mut c, 1, "wri.bob.testnet");
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
        assert_eq!(completed(&c, "res.bob.testnet"), 1);
    }

    // ---- approve_task ----------------------------------------------------

    #[test]
    fn p1_p3_approve_pays_owners_and_coordinator() {
        let mut c = submitted_world();
        ctx("alice.testnet", yocto(1));
        let t = c.approve_task(0);
        assert_eq!(t.status, TaskStatus::Settled);
        assert_eq!(c.get_task(0).unwrap().status, TaskStatus::Settled);
        assert_eq!(
            transfers(),
            vec![
                (acc("bob.testnet"), near(2)),
                (acc("bob.testnet"), near(3)),
                (acc("coord.testnet"), near(1)),
            ]
        );
        assert_eq!(total_out(), t.escrow); // X1
        assert_eq!(completed(&c, "res.bob.testnet"), 1);
        assert_eq!(completed(&c, "wri.bob.testnet"), 1);
        assert_eq!(completed(&c, "res.carol.testnet"), 0);
    }

    #[test]
    fn p3_payout_goes_to_each_agents_owner_not_agent() {
        let mut c = world();
        assign(&mut c, 0, "res.carol.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.carol.testnet");
        submit(&mut c, 1, "wri.bob.testnet");
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
        assert_eq!(
            transfers(),
            vec![
                (acc("carol.testnet"), near(2)),
                (acc("bob.testnet"), near(3)),
                (acc("coord.testnet"), near(1)),
            ]
        );
    }

    #[test]
    fn p3_zero_fee_skips_coordinator_transfer() {
        let mut c = world();
        ctx("alice.testnet", near(2));
        let mut s = slots(&[1]);
        s[0].role = "research".into();
        c.create_task(hash(), s, near(0), U64(DEADLINE)); // task 1
        ctx("coord.testnet", yocto(0));
        c.assign_slot(1, 0, acc("res.bob.testnet"));
        ctx("res.bob.testnet", yocto(0));
        c.submit_contribution(1, 0, rhash(), None);
        ctx("alice.testnet", yocto(1));
        c.approve_task(1);
        assert_eq!(transfers(), vec![(acc("bob.testnet"), near(1))]);
    }

    #[test]
    #[should_panic(expected = "only the task creator can approve")]
    fn p1_non_creator_cannot_approve() {
        let mut c = submitted_world();
        ctx("bob.testnet", yocto(1));
        c.approve_task(0);
    }

    #[test]
    #[should_panic(expected = "only the task creator can approve")]
    fn p1_coordinator_cannot_approve() {
        let mut c = submitted_world();
        ctx("coord.testnet", yocto(1));
        c.approve_task(0);
    }

    #[test]
    #[should_panic(expected = "task is not submitted")]
    fn p1_double_approve_fails() {
        let mut c = submitted_world();
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
    }

    #[test]
    #[should_panic(expected = "task is not submitted")]
    fn p1_approve_before_submitted_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.bob.testnet"); // only one of two
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
    }

    #[test]
    #[should_panic(expected = "task is not submitted")]
    fn p1_approve_funded_task_fails() {
        let mut c = world();
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn m1_approve_without_one_yocto_fails() {
        let mut c = submitted_world();
        ctx("alice.testnet", yocto(0));
        c.approve_task(0);
    }

    // ---- release_payment -------------------------------------------------

    #[test]
    #[should_panic(expected = "review period has not passed")]
    fn p2_release_before_24h_fails() {
        let mut c = submitted_world();
        ctx_at("dave.testnet", yocto(1), NOW + REVIEW_PERIOD - 1);
        c.release_payment(0);
    }

    #[test]
    fn p2_release_after_24h_by_anyone_succeeds() {
        let mut c = submitted_world();
        // also well past the task deadline: Submitted tasks ignore the deadline
        ctx_at("dave.testnet", yocto(1), NOW + REVIEW_PERIOD);
        let t = c.release_payment(0);
        assert_eq!(t.status, TaskStatus::Settled);
        assert_eq!(
            transfers(),
            vec![
                (acc("bob.testnet"), near(2)),
                (acc("bob.testnet"), near(3)),
                (acc("coord.testnet"), near(1)),
            ]
        );
        assert_eq!(total_out(), t.escrow); // X1
        assert_eq!(completed(&c, "res.bob.testnet"), 1);
    }

    #[test]
    #[should_panic(expected = "task is not submitted")]
    fn p2_release_after_approve_fails() {
        let mut c = submitted_world();
        ctx("alice.testnet", yocto(1));
        c.approve_task(0);
        ctx_at("dave.testnet", yocto(1), NOW + REVIEW_PERIOD);
        c.release_payment(0);
    }

    #[test]
    #[should_panic(expected = "task is not submitted")]
    fn p2_release_in_progress_task_fails() {
        let mut c = world();
        assign(&mut c, 0, "res.bob.testnet");
        ctx_at("dave.testnet", yocto(1), NOW + REVIEW_PERIOD);
        c.release_payment(0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn m1_release_without_one_yocto_fails() {
        let mut c = submitted_world();
        ctx_at("dave.testnet", yocto(0), NOW + REVIEW_PERIOD);
        c.release_payment(0);
    }

    // ---- expire_task -----------------------------------------------------

    #[test]
    #[should_panic(expected = "task deadline has not passed")]
    fn e1_expire_before_deadline_fails() {
        let mut c = world();
        ctx_at("alice.testnet", yocto(1), DEADLINE - 1);
        c.expire_task(0);
    }

    #[test]
    #[should_panic(expected = "task cannot be expired in its current status")]
    fn e2_expire_submitted_task_fails() {
        let mut c = submitted_world();
        ctx_at("alice.testnet", yocto(1), DEADLINE + HOUR);
        c.expire_task(0);
    }

    #[test]
    #[should_panic(expected = "only the task creator can expire")]
    fn e1_non_creator_cannot_expire() {
        let mut c = world();
        ctx_at("coord.testnet", yocto(1), DEADLINE);
        c.expire_task(0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn m1_expire_without_one_yocto_fails() {
        let mut c = world();
        ctx_at("alice.testnet", yocto(0), DEADLINE);
        c.expire_task(0);
    }

    #[test]
    fn e3_expire_funded_task_refunds_everything() {
        let mut c = world();
        ctx_at("alice.testnet", yocto(1), DEADLINE);
        let t = c.expire_task(0);
        assert_eq!(t.status, TaskStatus::Expired);
        assert_eq!(transfers(), vec![(acc("alice.testnet"), near(6))]);
    }

    #[test]
    fn e3_expire_pays_submitted_slots_and_refunds_rest() {
        let mut c = world();
        assign(&mut c, 0, "res.carol.testnet");
        assign(&mut c, 1, "wri.bob.testnet");
        submit(&mut c, 0, "res.carol.testnet"); // slot 1 never submitted
        ctx_at("alice.testnet", yocto(1), DEADLINE);
        let t = c.expire_task(0);
        assert_eq!(t.status, TaskStatus::Expired);
        assert_eq!(c.get_task(0).unwrap().status, TaskStatus::Expired);
        assert_eq!(
            transfers(),
            vec![
                (acc("carol.testnet"), near(2)), // submitted slot
                (acc("alice.testnet"), near(4)), // 3 unsubmitted + 1 fee
            ]
        );
        assert_eq!(total_out(), t.escrow); // X1
        assert_eq!(completed(&c, "res.carol.testnet"), 1);
        assert_eq!(completed(&c, "wri.bob.testnet"), 0);
    }

    #[test]
    #[should_panic(expected = "task cannot be expired in its current status")]
    fn e2_expire_twice_fails() {
        let mut c = world();
        ctx_at("alice.testnet", yocto(1), DEADLINE);
        c.expire_task(0);
        ctx_at("alice.testnet", yocto(1), DEADLINE);
        c.expire_task(0);
    }

    #[test]
    #[should_panic(expected = "task cannot be expired in its current status")]
    fn e2_expire_cancelled_task_fails() {
        let mut c = world();
        ctx("alice.testnet", yocto(1));
        c.cancel_task(0);
        ctx_at("alice.testnet", yocto(1), DEADLINE);
        c.expire_task(0);
    }

    // ---- X1: total paid never exceeds escrow -----------------------------

    /// Every ending (approve / release / expire) × every mix of submitted
    /// slots: the allowed ending pays out exactly escrow, the disallowed ones
    /// fail, and any second payout attempt fails.
    #[test]
    fn x1_total_paid_equals_escrow_on_every_path() {
        fn run(c: &mut Contract, path: &str, t: u64) {
            match path {
                "approve" => {
                    ctx_at("alice.testnet", yocto(1), t);
                    c.approve_task(0);
                }
                "release" => {
                    ctx_at("dave.testnet", yocto(1), t);
                    c.release_payment(0);
                }
                _ => {
                    ctx_at("alice.testnet", yocto(1), t);
                    c.expire_task(0);
                }
            }
        }
        let t = DEADLINE + REVIEW_PERIOD;
        for mask in 0..4u8 {
            for path in ["approve", "release", "expire"] {
                let mut c = world();
                assign(&mut c, 0, "res.bob.testnet");
                assign(&mut c, 1, "wri.bob.testnet");
                if mask & 1 != 0 {
                    submit(&mut c, 0, "res.bob.testnet");
                }
                if mask & 2 != 0 {
                    submit(&mut c, 1, "wri.bob.testnet");
                }
                let escrow = c.get_task(0).unwrap().escrow;
                let first = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run(&mut c, path, t);
                    total_out()
                }));
                // approve/release need all slots submitted; expire needs not-all
                let all = mask == 3;
                assert_eq!(
                    first.is_ok(),
                    (path == "expire") != all,
                    "{path} mask={mask}"
                );
                if let Ok(out) = first {
                    assert_eq!(out, escrow, "{path} mask={mask}");
                    for again in ["approve", "release", "expire"] {
                        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            run(&mut c, again, t);
                        }));
                        assert!(r.is_err(), "second payout via {again} after {path}");
                    }
                }
            }
        }
    }
}
