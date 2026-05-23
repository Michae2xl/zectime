//! Halo2 timestamp-predicate circuit - Phase T.7.
//!
//! Proves, without revealing the document structure:
//!
//! 1. The publicly announced `commitment` equals
//!    `Poseidon(domain_tag, doc_root, 0, nonce)`. This is the same domain-tagged
//!    Poseidon hash used by [`crate::timestamp::TimestampOpenCircuit`], so
//!    predicate stamps interop with file-mode stamps: a structured-doc stamp
//!    sets `doc_hash_lo = doc_root` and `doc_hash_hi = 0` on the receipt and
//!    the original open-circuit commitment formula still applies.
//! 2. `Poseidon(leaf_tag, field_index, field_value)` is the leaf at position
//!    `field_index` in a depth-8 Merkle-Poseidon tree rooted at `doc_root`.
//!    Sibling hashes at each level are supplied as private witnesses and the
//!    path direction is encoded as 8 boolean `path_bits`.
//! 3. `field_index` equals the little-endian composition of the 8 path bits,
//!    binding the revealed claim's index to the Merkle path the prover walked.
//! 4. The publicly announced `claim_hash` equals
//!    `Poseidon(claim_tag, field_index, field_value)`, giving the verifier a
//!    compact commitment to the (index, value) pair without revealing either.
//!
//! Public inputs (instance column, in order):
//!
//! | index | meaning         |
//! |-------|-----------------|
//! | 0     | `commitment`    |
//! | 1     | `block_height`  |
//! | 2     | `claim_hash`    |
//!
//! Private witnesses: `doc_root`, `nonce`, `field_index`, `field_value`,
//! `path_bits[0..8]`, `siblings[0..8]`.
//!
//! The Merkle tree stores `Poseidon(node_tag, left, right)` at every internal
//! node. Leaves are `Poseidon(leaf_tag, field_index, field_value)`. Domain tags
//! keep leaf, internal-node, and claim hashes in separate domains.

use std::marker::PhantomData;

use ff::PrimeField;
use halo2_gadgets::poseidon::{
    primitives::{ConstantLength, P128Pow5T3, Spec as PoseidonSpec},
    Hash as PoseidonHash, Pow5Chip, Pow5Config,
};
use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    plonk::{
        Advice, Circuit, Column, ConstraintSystem, Constraints, Error, Expression, Fixed, Instance,
        Selector,
    },
    poly::Rotation,
};

/// Merkle tree depth (number of levels of sibling hashes the path walks).
pub const TREE_DEPTH: usize = 8;

/// Poseidon arity for Merkle internal nodes: `Poseidon(node_tag, left, right)`.
pub const MERKLE_ARITY: usize = 3;

/// Poseidon arity for the commitment — matches
/// [`crate::timestamp::TimestampOpenCircuit`]'s domain-tagged 4-input shape.
pub const COMMITMENT_ARITY: usize = 4;

/// Poseidon arity for leaf/claim hashes: `Poseidon(tag, field_index, field_value)`.
pub const CLAIM_ARITY: usize = 3;

/// Domain tag for predicate tree leaves.
pub const PREDICATE_LEAF_DOMAIN_TAG: u64 = 0x0000_5a65_4c65_6166;

/// Domain tag for predicate tree internal nodes.
pub const PREDICATE_NODE_DOMAIN_TAG: u64 = 0x0000_5a65_4e6f_6465;

/// Domain tag for predicate claim hashes.
pub const PREDICATE_CLAIM_DOMAIN_TAG: u64 = 0x005a_6543_6c61_696d;

/// Poseidon width used by `P128Pow5T3` (3 state words).
pub(crate) const POSEIDON_WIDTH: usize = 3;

/// Poseidon rate used by `P128Pow5T3` (2 absorbable words per permutation).
pub(crate) const POSEIDON_RATE: usize = 2;

/// Instance-column index of `commitment`.
pub const INSTANCE_COMMITMENT: usize = 0;

/// Instance-column index of `block_height`.
pub const INSTANCE_BLOCK_HEIGHT: usize = 1;

/// Instance-column index of `claim_hash`.
pub const INSTANCE_CLAIM_HASH: usize = 2;

/// Configuration for [`TimestampPredicateCircuit`].
#[derive(Clone, Debug)]
pub struct TimestampPredicateConfig<F: PrimeField> {
    /// General-purpose advice column for witness scalars and copy targets.
    main: Column<Advice>,
    /// Advice holding the Merkle current-node value at swap rows.
    swap_cur: Column<Advice>,
    /// Advice holding the Merkle sibling value at swap rows.
    swap_sib: Column<Advice>,
    /// Advice holding the Merkle path bit at swap rows.
    swap_bit: Column<Advice>,
    /// Advice holding the chosen left input at swap rows.
    swap_left: Column<Advice>,
    /// Advice holding the chosen right input at swap rows.
    swap_right: Column<Advice>,
    /// Selector enabling the Merkle swap gate.
    q_swap: Selector,
    /// Advice column holding the 8 path bits for the composition gate.
    bits: Column<Advice>,
    /// Advice column holding `field_index` for the composition gate.
    bits_index: Column<Advice>,
    /// Selector enabling the bit-composition gate.
    q_compose: Selector,
    /// Public inputs: `[commitment, block_height, claim_hash]`.
    instance: Column<Instance>,
    /// Poseidon chip config shared across Merkle, commitment, and claim hashes.
    poseidon: Pow5Config<F, POSEIDON_WIDTH, POSEIDON_RATE>,
}

/// The timestamp-predicate circuit.
#[derive(Clone, Debug)]
pub struct TimestampPredicateCircuit<F: PrimeField> {
    /// Merkle-Poseidon root over the document's field leaves (private).
    pub doc_root: Value<F>,
    /// Per-commitment random nonce (private, same as OpenCircuit).
    pub nonce: Value<F>,
    /// Block height the commitment is anchored at (also public instance[1]).
    pub block_height: Value<F>,
    /// Index of the revealed field (private; bound to `claim_hash`).
    pub field_index: Value<F>,
    /// Value of the revealed field (private; bound to `claim_hash`).
    pub field_value: Value<F>,
    /// Path bits from the leaf up to the root. 0 = current is left child,
    /// 1 = current is right child. Entry 0 is the bottom-most sibling.
    pub path_bits: [Value<F>; TREE_DEPTH],
    /// Sibling hashes along the Merkle path, bottom-up.
    pub siblings: [Value<F>; TREE_DEPTH],
    _marker: PhantomData<F>,
}

impl<F: PrimeField> Default for TimestampPredicateCircuit<F> {
    fn default() -> Self {
        Self {
            doc_root: Value::unknown(),
            nonce: Value::unknown(),
            block_height: Value::unknown(),
            field_index: Value::unknown(),
            field_value: Value::unknown(),
            path_bits: [Value::unknown(); TREE_DEPTH],
            siblings: [Value::unknown(); TREE_DEPTH],
            _marker: PhantomData,
        }
    }
}

impl<F: PrimeField> TimestampPredicateCircuit<F>
where
    P128Pow5T3: PoseidonSpec<F, POSEIDON_WIDTH, POSEIDON_RATE>,
{
    /// Construct a fully-populated circuit from known witness values.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        doc_root: F,
        nonce: F,
        block_height: F,
        field_index: F,
        field_value: F,
        path_bits: [F; TREE_DEPTH],
        siblings: [F; TREE_DEPTH],
    ) -> Self {
        Self {
            doc_root: Value::known(doc_root),
            nonce: Value::known(nonce),
            block_height: Value::known(block_height),
            field_index: Value::known(field_index),
            field_value: Value::known(field_value),
            path_bits: path_bits.map(Value::known),
            siblings: siblings.map(Value::known),
            _marker: PhantomData,
        }
    }

    /// Out-of-circuit commitment: `Poseidon(domain_tag, doc_root, 0, nonce)`.
    /// Matches [`crate::timestamp::TimestampOpenCircuit::compute_commitment`]
    /// with `doc_hash_lo = doc_root` and `doc_hash_hi = 0`.
    pub fn compute_commitment(doc_root: F, nonce: F, _block_height: F) -> F {
        use halo2_gadgets::poseidon::primitives::Hash;
        Hash::<F, P128Pow5T3, ConstantLength<COMMITMENT_ARITY>, POSEIDON_WIDTH, POSEIDON_RATE>::init(
        )
        .hash([
            F::from(crate::timestamp::TIMESTAMP_COMMITMENT_DOMAIN_TAG),
            doc_root,
            F::ZERO,
            nonce,
        ])
    }

    /// Out-of-circuit leaf hash: `Poseidon(leaf_tag, field_index, field_value)`.
    pub fn compute_leaf_hash(field_index: F, field_value: F) -> F {
        use halo2_gadgets::poseidon::primitives::Hash;
        Hash::<F, P128Pow5T3, ConstantLength<CLAIM_ARITY>, POSEIDON_WIDTH, POSEIDON_RATE>::init()
            .hash([F::from(PREDICATE_LEAF_DOMAIN_TAG), field_index, field_value])
    }

    /// Out-of-circuit claim hash: `Poseidon(claim_tag, field_index, field_value)`.
    pub fn compute_claim_hash(field_index: F, field_value: F) -> F {
        use halo2_gadgets::poseidon::primitives::Hash;
        Hash::<F, P128Pow5T3, ConstantLength<CLAIM_ARITY>, POSEIDON_WIDTH, POSEIDON_RATE>::init()
            .hash([
                F::from(PREDICATE_CLAIM_DOMAIN_TAG),
                field_index,
                field_value,
            ])
    }

    /// Out-of-circuit internal-node hash: `Poseidon(node_tag, left, right)`.
    pub fn compute_node_hash(left: F, right: F) -> F {
        use halo2_gadgets::poseidon::primitives::Hash;
        Hash::<F, P128Pow5T3, ConstantLength<MERKLE_ARITY>, POSEIDON_WIDTH, POSEIDON_RATE>::init()
            .hash([F::from(PREDICATE_NODE_DOMAIN_TAG), left, right])
    }

    /// Out-of-circuit Merkle root reconstruction from a tagged leaf hash.
    /// Follows the same
    /// (current, sibling, bit) fold used inside `synthesize`, with `bit == 0`
    /// placing `current` on the left.
    pub fn compute_merkle_root(
        leaf: F,
        path_bits: &[F; TREE_DEPTH],
        siblings: &[F; TREE_DEPTH],
    ) -> F {
        let mut current = leaf;
        for i in 0..TREE_DEPTH {
            let bit = path_bits[i];
            let (left, right) = if bit == F::ZERO {
                (current, siblings[i])
            } else {
                (siblings[i], current)
            };
            current = Self::compute_node_hash(left, right);
        }
        current
    }

    /// Compose `field_index` from path bits (little-endian). The in-circuit
    /// gate enforces exactly this identity.
    pub fn compose_field_index(path_bits: &[F; TREE_DEPTH]) -> F {
        let mut index = F::ZERO;
        let mut weight = F::ONE;
        let two = F::from(2u64);
        for bit in path_bits.iter() {
            index += *bit * weight;
            weight *= two;
        }
        index
    }

    /// Build the public-input vector `[commitment, block_height, claim_hash]`
    /// for the supplied witness.
    #[allow(clippy::too_many_arguments)]
    pub fn public_inputs(
        doc_root: F,
        nonce: F,
        block_height: F,
        field_index: F,
        field_value: F,
    ) -> Vec<F> {
        vec![
            Self::compute_commitment(doc_root, nonce, block_height),
            block_height,
            Self::compute_claim_hash(field_index, field_value),
        ]
    }
}

impl<F: PrimeField> Circuit<F> for TimestampPredicateCircuit<F>
where
    P128Pow5T3: PoseidonSpec<F, POSEIDON_WIDTH, POSEIDON_RATE>,
{
    type Config = TimestampPredicateConfig<F>;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self::default()
    }

    fn configure(meta: &mut ConstraintSystem<F>) -> Self::Config {
        let main = meta.advice_column();
        let swap_cur = meta.advice_column();
        let swap_sib = meta.advice_column();
        let swap_bit = meta.advice_column();
        let swap_left = meta.advice_column();
        let swap_right = meta.advice_column();
        let bits = meta.advice_column();
        let bits_index = meta.advice_column();
        let instance = meta.instance_column();

        meta.enable_equality(main);
        meta.enable_equality(swap_cur);
        meta.enable_equality(swap_sib);
        meta.enable_equality(swap_bit);
        meta.enable_equality(swap_left);
        meta.enable_equality(swap_right);
        meta.enable_equality(bits);
        meta.enable_equality(bits_index);
        meta.enable_equality(instance);

        let constants = meta.fixed_column();
        meta.enable_constant(constants);

        let q_swap = meta.selector();
        meta.create_gate("merkle swap", |meta| {
            let q = meta.query_selector(q_swap);
            let cur = meta.query_advice(swap_cur, Rotation::cur());
            let sib = meta.query_advice(swap_sib, Rotation::cur());
            let bit = meta.query_advice(swap_bit, Rotation::cur());
            let left = meta.query_advice(swap_left, Rotation::cur());
            let right = meta.query_advice(swap_right, Rotation::cur());
            let one = Expression::Constant(F::ONE);

            // bit ∈ {0, 1}
            let bool_constraint = bit.clone() * (one.clone() - bit.clone());
            // left  = (1 - bit) * cur + bit * sib
            let left_constraint =
                left - ((one.clone() - bit.clone()) * cur.clone() + bit.clone() * sib.clone());
            // right = (1 - bit) * sib + bit * cur
            let right_constraint = right - ((one - bit.clone()) * sib + bit * cur);

            Constraints::with_selector(q, vec![bool_constraint, left_constraint, right_constraint])
        });

        let q_compose = meta.selector();
        meta.create_gate("field_index bit composition", |meta| {
            let q = meta.query_selector(q_compose);
            // bits[0] at rotation 0 ... bits[7] at rotation 7
            let mut acc = Expression::Constant(F::ZERO);
            let mut weight = F::ONE;
            let two = F::from(2u64);
            for i in 0..TREE_DEPTH {
                let b = meta.query_advice(bits, Rotation(i as i32));
                acc = acc + b * Expression::Constant(weight);
                weight *= two;
            }
            let index = meta.query_advice(bits_index, Rotation::cur());
            Constraints::with_selector(q, vec![index - acc])
        });

        let poseidon_state: [Column<Advice>; POSEIDON_WIDTH] = [
            meta.advice_column(),
            meta.advice_column(),
            meta.advice_column(),
        ];
        let poseidon_partial = meta.advice_column();
        let rc_a: [Column<Fixed>; POSEIDON_WIDTH] = [
            meta.fixed_column(),
            meta.fixed_column(),
            meta.fixed_column(),
        ];
        let rc_b: [Column<Fixed>; POSEIDON_WIDTH] = [
            meta.fixed_column(),
            meta.fixed_column(),
            meta.fixed_column(),
        ];
        let poseidon =
            Pow5Chip::configure::<P128Pow5T3>(meta, poseidon_state, poseidon_partial, rc_a, rc_b);

        TimestampPredicateConfig {
            main,
            swap_cur,
            swap_sib,
            swap_bit,
            swap_left,
            swap_right,
            q_swap,
            bits,
            bits_index,
            q_compose,
            instance,
            poseidon,
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<F>,
    ) -> Result<(), Error> {
        // ------------------------------------------------------------------
        // 1. Witness assignment + bit composition.
        // ------------------------------------------------------------------
        let (doc_root_cell, nonce_cell, block_height_cell, field_value_cell) = layouter
            .assign_region(
                || "predicate witnesses",
                |mut region| {
                    let doc_root =
                        region.assign_advice(|| "doc_root", config.main, 0, || self.doc_root)?;
                    let nonce = region.assign_advice(|| "nonce", config.main, 1, || self.nonce)?;
                    let block_height = region.assign_advice_from_instance(
                        || "block_height",
                        config.instance,
                        INSTANCE_BLOCK_HEIGHT,
                        config.main,
                        2,
                    )?;
                    let field_value = region.assign_advice(
                        || "field_value",
                        config.main,
                        3,
                        || self.field_value,
                    )?;
                    Ok((doc_root, nonce, block_height, field_value))
                },
            )?;

        let (field_index_cell, path_bit_cells) = layouter.assign_region(
            || "field_index composition",
            |mut region| {
                let mut bit_cells = Vec::with_capacity(TREE_DEPTH);
                for (i, bit) in self.path_bits.iter().enumerate() {
                    let cell = region.assign_advice(
                        || format!("path_bits[{i}]"),
                        config.bits,
                        i,
                        || *bit,
                    )?;
                    bit_cells.push(cell);
                }
                let index_cell = region.assign_advice(
                    || "field_index",
                    config.bits_index,
                    0,
                    || self.field_index,
                )?;
                config.q_compose.enable(&mut region, 0)?;
                Ok((index_cell, bit_cells))
            },
        )?;

        // ------------------------------------------------------------------
        // 2. Merkle path: fold from tagged leaf up to doc_root.
        // ------------------------------------------------------------------
        let leaf_tag_cell = layouter.assign_region(
            || "predicate leaf domain tag",
            |mut region| {
                region.assign_advice_from_constant(
                    || "leaf domain tag",
                    config.main,
                    0,
                    F::from(PREDICATE_LEAF_DOMAIN_TAG),
                )
            },
        )?;
        let leaf_chip = Pow5Chip::construct(config.poseidon.clone());
        let leaf_hasher = PoseidonHash::<
            F,
            Pow5Chip<F, POSEIDON_WIDTH, POSEIDON_RATE>,
            P128Pow5T3,
            ConstantLength<CLAIM_ARITY>,
            POSEIDON_WIDTH,
            POSEIDON_RATE,
        >::init(leaf_chip, layouter.namespace(|| "leaf init"))?;
        let mut current = leaf_hasher.hash(
            layouter.namespace(|| "leaf hash"),
            [
                leaf_tag_cell,
                field_index_cell.clone(),
                field_value_cell.clone(),
            ],
        )?;

        let node_tag_cell = layouter.assign_region(
            || "predicate node domain tag",
            |mut region| {
                region.assign_advice_from_constant(
                    || "node domain tag",
                    config.main,
                    0,
                    F::from(PREDICATE_NODE_DOMAIN_TAG),
                )
            },
        )?;
        #[allow(clippy::needless_range_loop)]
        for level in 0..TREE_DEPTH {
            let (left_cell, right_cell) =
                layouter.assign_region(
                    || format!("merkle swap level {level}"),
                    |mut region| {
                        config.q_swap.enable(&mut region, 0)?;

                        let cur = current.copy_advice(
                            || format!("cur level {level}"),
                            &mut region,
                            config.swap_cur,
                            0,
                        )?;
                        let sib = region.assign_advice(
                            || format!("sibling level {level}"),
                            config.swap_sib,
                            0,
                            || self.siblings[level],
                        )?;
                        let bit = path_bit_cells[level].copy_advice(
                            || format!("bit level {level}"),
                            &mut region,
                            config.swap_bit,
                            0,
                        )?;

                        let left_value = bit.value().zip(cur.value().zip(sib.value())).map(
                            |(bit, (cur, sib))| {
                                if *bit == F::ZERO {
                                    *cur
                                } else {
                                    *sib
                                }
                            },
                        );
                        let right_value = bit.value().zip(cur.value().zip(sib.value())).map(
                            |(bit, (cur, sib))| {
                                if *bit == F::ZERO {
                                    *sib
                                } else {
                                    *cur
                                }
                            },
                        );

                        let left = region.assign_advice(
                            || format!("left level {level}"),
                            config.swap_left,
                            0,
                            || left_value,
                        )?;
                        let right = region.assign_advice(
                            || format!("right level {level}"),
                            config.swap_right,
                            0,
                            || right_value,
                        )?;

                        Ok((left, right))
                    },
                )?;

            let chip = Pow5Chip::construct(config.poseidon.clone());
            let hasher = PoseidonHash::<
                F,
                Pow5Chip<F, POSEIDON_WIDTH, POSEIDON_RATE>,
                P128Pow5T3,
                ConstantLength<MERKLE_ARITY>,
                POSEIDON_WIDTH,
                POSEIDON_RATE,
            >::init(
                chip,
                layouter.namespace(|| format!("merkle init level {level}")),
            )?;
            current = hasher.hash(
                layouter.namespace(|| format!("merkle hash level {level}")),
                [node_tag_cell.clone(), left_cell, right_cell],
            )?;
        }

        // After TREE_DEPTH folds, `current` must equal `doc_root`.
        layouter.assign_region(
            || "bind merkle root to doc_root",
            |mut region| {
                let bound =
                    current.copy_advice(|| "merkle result", &mut region, config.swap_left, 0)?;
                let expected = doc_root_cell.copy_advice(
                    || "doc_root copy",
                    &mut region,
                    config.swap_right,
                    0,
                )?;
                region.constrain_equal(bound.cell(), expected.cell())?;
                Ok(())
            },
        )?;

        // ------------------------------------------------------------------
        // 3. Commitment rebinding:
        //    Poseidon(domain_tag, doc_root, 0, nonce) == instance[0].
        // ------------------------------------------------------------------
        let domain_tag_cell = layouter.assign_region(
            || "commitment domain tag",
            |mut region| {
                region.assign_advice_from_constant(
                    || "domain_tag",
                    config.main,
                    0,
                    F::from(crate::timestamp::TIMESTAMP_COMMITMENT_DOMAIN_TAG),
                )
            },
        )?;
        let zero_cell = layouter.assign_region(
            || "constant zero",
            |mut region| region.assign_advice_from_constant(|| "zero", config.main, 0, F::ZERO),
        )?;

        let commitment_chip = Pow5Chip::construct(config.poseidon.clone());
        let commitment_hasher =
            PoseidonHash::<
                F,
                Pow5Chip<F, POSEIDON_WIDTH, POSEIDON_RATE>,
                P128Pow5T3,
                ConstantLength<COMMITMENT_ARITY>,
                POSEIDON_WIDTH,
                POSEIDON_RATE,
            >::init(commitment_chip, layouter.namespace(|| "commitment init"))?;
        let commitment = commitment_hasher.hash(
            layouter.namespace(|| "commitment hash"),
            [
                domain_tag_cell,
                doc_root_cell.clone(),
                zero_cell,
                nonce_cell.clone(),
            ],
        )?;
        layouter.constrain_instance(commitment.cell(), config.instance, INSTANCE_COMMITMENT)?;

        // ------------------------------------------------------------------
        // 4. Claim hash: Poseidon(claim_tag, field_index, field_value) == instance[2].
        // ------------------------------------------------------------------
        let claim_tag_cell = layouter.assign_region(
            || "predicate claim domain tag",
            |mut region| {
                region.assign_advice_from_constant(
                    || "claim domain tag",
                    config.main,
                    0,
                    F::from(PREDICATE_CLAIM_DOMAIN_TAG),
                )
            },
        )?;
        let claim_chip = Pow5Chip::construct(config.poseidon.clone());
        let claim_hasher = PoseidonHash::<
            F,
            Pow5Chip<F, POSEIDON_WIDTH, POSEIDON_RATE>,
            P128Pow5T3,
            ConstantLength<CLAIM_ARITY>,
            POSEIDON_WIDTH,
            POSEIDON_RATE,
        >::init(claim_chip, layouter.namespace(|| "claim init"))?;
        let claim = claim_hasher.hash(
            layouter.namespace(|| "claim hash"),
            [claim_tag_cell, field_index_cell, field_value_cell.clone()],
        )?;
        layouter.constrain_instance(claim.cell(), config.instance, INSTANCE_CLAIM_HASH)?;

        // `block_height_cell` was assigned from instance via
        // `assign_advice_from_instance`, so instance[1] is already bound.
        let _ = (nonce_cell, block_height_cell, field_value_cell);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ff::Field;
    use halo2_proofs::dev::MockProver;
    use pasta_curves::Fp;

    const K: u32 = 10;
    const DEFAULT_NONCE: u64 = 0xdead_beef_cafe_f00d;
    const DEFAULT_BLOCK_HEIGHT: u64 = 2_750_000;

    /// Build a tree over 2^TREE_DEPTH = 256 leaves, all set to deterministic
    /// values. Returns the root, the Merkle path for `target_index`, and the
    /// leaf value at `target_index`.
    fn build_tree(target_index: usize) -> (Fp, [Fp; TREE_DEPTH], [Fp; TREE_DEPTH], Fp) {
        let leaf_count = 1 << TREE_DEPTH;
        let values: Vec<Fp> = (0..leaf_count)
            .map(|i| Fp::from(1_000u64 + i as u64))
            .collect();
        let leaves: Vec<Fp> = values
            .iter()
            .enumerate()
            .map(|(i, value)| {
                TimestampPredicateCircuit::<Fp>::compute_leaf_hash(Fp::from(i as u64), *value)
            })
            .collect();

        let target_leaf = values[target_index];

        let mut layer = leaves.clone();
        let mut siblings = [Fp::ZERO; TREE_DEPTH];
        let mut path_bits = [Fp::ZERO; TREE_DEPTH];
        let mut current_index = target_index;

        for level in 0..TREE_DEPTH {
            let is_right = current_index & 1 == 1;
            let sibling_index = if is_right {
                current_index - 1
            } else {
                current_index + 1
            };
            siblings[level] = layer[sibling_index];
            path_bits[level] = if is_right { Fp::ONE } else { Fp::ZERO };

            // Hash pairwise to build the next layer.
            let mut next = Vec::with_capacity(layer.len() / 2);
            let mut i = 0;
            while i < layer.len() {
                use halo2_gadgets::poseidon::primitives::Hash;
                let h = Hash::<
                    Fp,
                    P128Pow5T3,
                    ConstantLength<MERKLE_ARITY>,
                    POSEIDON_WIDTH,
                    POSEIDON_RATE,
                >::init()
                .hash([Fp::from(PREDICATE_NODE_DOMAIN_TAG), layer[i], layer[i + 1]]);
                next.push(h);
                i += 2;
            }
            layer = next;
            current_index /= 2;
        }

        let root = layer[0];
        (root, siblings, path_bits, target_leaf)
    }

    fn default_circuit(target_index: usize) -> (TimestampPredicateCircuit<Fp>, Vec<Fp>) {
        let (root, siblings, path_bits, leaf) = build_tree(target_index);
        let circuit = TimestampPredicateCircuit::<Fp>::new(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(target_index as u64),
            leaf,
            path_bits,
            siblings,
        );
        let public = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(target_index as u64),
            leaf,
        );
        (circuit, public)
    }

    #[test]
    fn valid_predicate_passes() {
        let (circuit, public) = default_circuit(42);
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn leftmost_index_passes() {
        let (circuit, public) = default_circuit(0);
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn rightmost_index_passes() {
        let (circuit, public) = default_circuit(255);
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn tampered_commitment_fails() {
        let (circuit, mut public) = default_circuit(42);
        public[INSTANCE_COMMITMENT] += Fp::ONE;
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn tampered_claim_hash_fails() {
        let (circuit, mut public) = default_circuit(42);
        public[INSTANCE_CLAIM_HASH] += Fp::ONE;
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn block_height_is_external_anchor_evidence() {
        let (circuit, mut public) = default_circuit(42);
        public[INSTANCE_BLOCK_HEIGHT] += Fp::ONE;
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn wrong_sibling_fails() {
        let (root, mut siblings, path_bits, leaf) = build_tree(42);
        siblings[3] += Fp::ONE;
        let circuit = TimestampPredicateCircuit::<Fp>::new(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(42u64),
            leaf,
            path_bits,
            siblings,
        );
        let public = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(42u64),
            leaf,
        );
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn wrong_field_value_fails() {
        let (root, siblings, path_bits, _leaf) = build_tree(42);
        let bogus_leaf = Fp::from(999_999u64);
        let circuit = TimestampPredicateCircuit::<Fp>::new(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(42u64),
            bogus_leaf,
            path_bits,
            siblings,
        );
        // Use the bogus leaf in the claim so claim_hash matches but the
        // Merkle fold now lands on a different root than the public one.
        let public = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(42u64),
            bogus_leaf,
        );
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn non_boolean_path_bit_fails() {
        let (root, siblings, mut path_bits, leaf) = build_tree(42);
        path_bits[2] = Fp::from(2u64);
        let circuit = TimestampPredicateCircuit::<Fp>::new(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            TimestampPredicateCircuit::<Fp>::compose_field_index(&path_bits),
            leaf,
            path_bits,
            siblings,
        );
        // Build public inputs consistent with the tampered witness so only the
        // booleanity gate fails.
        let claim_index = TimestampPredicateCircuit::<Fp>::compose_field_index(&path_bits);
        let public = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            claim_index,
            leaf,
        );
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn index_bit_mismatch_fails() {
        let (root, siblings, path_bits, leaf) = build_tree(42);
        // Declare a different index than the bits compose to.
        let wrong_index = Fp::from(99u64);
        let circuit = TimestampPredicateCircuit::<Fp>::new(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            wrong_index,
            leaf,
            path_bits,
            siblings,
        );
        // Public claim_hash is computed with wrong_index to keep the claim
        // consistent with the witness; the composition gate should still fail.
        let public = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            Fp::from(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            wrong_index,
            leaf,
        );
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(prover.verify().is_err());
    }

    #[test]
    fn deterministic_claim_hash() {
        let a =
            TimestampPredicateCircuit::<Fp>::compute_claim_hash(Fp::from(7u64), Fp::from(99u64));
        let b =
            TimestampPredicateCircuit::<Fp>::compute_claim_hash(Fp::from(7u64), Fp::from(99u64));
        assert_eq!(a, b);
    }

    #[test]
    fn commitment_matches_open_circuit_with_zero_hi() {
        let doc_root = Fp::from(12345u64);
        let nonce = Fp::from(DEFAULT_NONCE);
        let block_height = Fp::from(DEFAULT_BLOCK_HEIGHT);

        let predicate_commit =
            TimestampPredicateCircuit::<Fp>::compute_commitment(doc_root, nonce, block_height);
        let open_commit = crate::timestamp::TimestampOpenCircuit::<Fp>::compute_commitment(
            doc_root,
            Fp::ZERO,
            nonce,
        );

        assert_eq!(
            predicate_commit, open_commit,
            "predicate commit must reuse the open-circuit formula with doc_hash_hi = 0"
        );
    }
}
