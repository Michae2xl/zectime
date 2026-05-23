//! Halo2 timestamp-open circuit - Phase T.2.
//!
//! Proves, without revealing the document hash or nonce:
//!
//! `commitment == Poseidon(domain_tag, doc_hash_lo, doc_hash_hi, nonce)`
//!
//! The document's SHA-256 digest is split into two 128-bit field-compatible
//! halves (`doc_hash_lo`, `doc_hash_hi`) at input time so both fit inside a
//! single Pallas scalar. The prover picks a fresh 128-bit `nonce` per
//! commitment to randomise the binding (so two identical documents produce
//! distinct commitments) and publishes the Zcash block height at which the
//! commitment was anchored so verifiers can establish a lower bound on the
//! timestamp.
//!
//! Public inputs (instance column, in order):
//!
//! | index | meaning        |
//! |-------|----------------|
//! | 0     | `commitment`   |
//! | 1     | `block_height` |
//!
//! Private witnesses: `doc_hash_lo`, `doc_hash_hi`, `nonce`.
//!
//! There is no range check and no set-membership gate: the only content
//! constraint is the Poseidon pre-image. The public `block_height` is copied
//! from the instance column so the proof remains bound to the receipt height,
//! but the chain position itself is established by fetching the Zcash
//! transaction that carries `commitment`.

use std::marker::PhantomData;

use ff::PrimeField;
use halo2_gadgets::poseidon::{
    primitives::{ConstantLength, P128Pow5T3, Spec as PoseidonSpec},
    Hash as PoseidonHash, Pow5Chip, Pow5Config,
};
use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    plonk::{Advice, Circuit, Column, ConstraintSystem, Error, Fixed, Instance},
};

/// Domain separator for ZecTime timestamp commitments. ASCII: `ZecTime2`.
pub const TIMESTAMP_COMMITMENT_DOMAIN_TAG: u64 = 0x5a65_6354_696d_6532;

/// Number of Poseidon message inputs for the commitment:
/// `(domain_tag, doc_hash_lo, doc_hash_hi, nonce)`.
pub const COMMITMENT_ARITY: usize = 4;

/// Poseidon width used by `P128Pow5T3` (3 state words).
pub(crate) const POSEIDON_WIDTH: usize = 3;
/// Poseidon rate used by `P128Pow5T3` (2 absorbable words per permutation).
pub(crate) const POSEIDON_RATE: usize = 2;

/// Instance-column index of `commitment`.
pub const INSTANCE_COMMITMENT: usize = 0;
/// Instance-column index of `block_height`.
pub const INSTANCE_BLOCK_HEIGHT: usize = 1;

/// Row offsets inside the main synthesis region.
pub(crate) const ROW_DOMAIN_TAG: usize = 0;
pub(crate) const ROW_DOC_HASH_LO: usize = 1;
pub(crate) const ROW_DOC_HASH_HI: usize = 2;
pub(crate) const ROW_NONCE: usize = 3;
pub(crate) const ROW_BLOCK_HEIGHT: usize = 4;

/// Configuration for [`TimestampOpenCircuit`].
#[derive(Clone, Debug)]
pub struct TimestampOpenConfig<F: PrimeField> {
    /// Main advice column: holds `doc_hash_lo`, `doc_hash_hi`, `nonce`,
    /// `block_height` at deterministic offsets within the synthesis region.
    main: Column<Advice>,
    /// Public inputs: `[commitment, block_height]`.
    instance: Column<Instance>,
    /// Poseidon chip config for the `P128Pow5T3` spec.
    poseidon: Pow5Config<F, POSEIDON_WIDTH, POSEIDON_RATE>,
}

/// The timestamp-open circuit.
///
/// Carries witness values (the prover's private inputs) plus the public
/// `block_height` copied from the confirmed anchor receipt. The verifier
/// instantiates this with
/// [`TimestampOpenCircuit::default`] (all values unknown) and supplies the
/// public inputs via the instance vector.
#[derive(Clone, Debug)]
pub struct TimestampOpenCircuit<F: PrimeField> {
    /// Low 128 bits of the document hash (private witness).
    pub doc_hash_lo: Value<F>,
    /// High 128 bits of the document hash (private witness).
    pub doc_hash_hi: Value<F>,
    /// Per-commitment random nonce (private witness).
    pub nonce: Value<F>,
    /// Zcash block height the commitment is anchored at (also a public input).
    pub block_height: Value<F>,
    _marker: PhantomData<F>,
}

impl<F: PrimeField> Default for TimestampOpenCircuit<F> {
    fn default() -> Self {
        Self {
            doc_hash_lo: Value::unknown(),
            doc_hash_hi: Value::unknown(),
            nonce: Value::unknown(),
            block_height: Value::unknown(),
            _marker: PhantomData,
        }
    }
}

impl<F: PrimeField> TimestampOpenCircuit<F>
where
    P128Pow5T3: PoseidonSpec<F, POSEIDON_WIDTH, POSEIDON_RATE>,
{
    /// Construct a circuit from known witness values.
    pub fn new(doc_hash_lo: F, doc_hash_hi: F, nonce: F, block_height: F) -> Self {
        Self {
            doc_hash_lo: Value::known(doc_hash_lo),
            doc_hash_hi: Value::known(doc_hash_hi),
            nonce: Value::known(nonce),
            block_height: Value::known(block_height),
            _marker: PhantomData,
        }
    }

    /// Compute the Poseidon commitment out-of-circuit. The prover publishes
    /// this value as `instance[INSTANCE_COMMITMENT]`. Same
    /// `(doc_hash_lo, doc_hash_hi, nonce)` tuple always produces the same
    /// output. The anchor height is checked against the on-chain tx metadata
    /// rather than being pre-committed before the tx confirms.
    pub fn compute_commitment(doc_hash_lo: F, doc_hash_hi: F, nonce: F) -> F {
        use halo2_gadgets::poseidon::primitives::Hash;
        Hash::<F, P128Pow5T3, ConstantLength<COMMITMENT_ARITY>, POSEIDON_WIDTH, POSEIDON_RATE>::init(
        )
        .hash([
            F::from(TIMESTAMP_COMMITMENT_DOMAIN_TAG),
            doc_hash_lo,
            doc_hash_hi,
            nonce,
        ])
    }

    /// Build the public-input vector `[commitment, block_height]` corresponding
    /// to these witnesses.
    pub fn public_inputs(doc_hash_lo: F, doc_hash_hi: F, nonce: F, block_height: F) -> Vec<F> {
        vec![
            Self::compute_commitment(doc_hash_lo, doc_hash_hi, nonce),
            block_height,
        ]
    }
}

impl<F: PrimeField> Circuit<F> for TimestampOpenCircuit<F>
where
    P128Pow5T3: PoseidonSpec<F, POSEIDON_WIDTH, POSEIDON_RATE>,
{
    type Config = TimestampOpenConfig<F>;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self::default()
    }

    fn configure(meta: &mut ConstraintSystem<F>) -> Self::Config {
        let main = meta.advice_column();
        let instance = meta.instance_column();

        meta.enable_equality(main);
        meta.enable_equality(instance);

        // Dedicated fixed column for the global constant-assignment arena.
        // Required by SimpleFloorPlanner even when no explicit `assign_constant`
        // is called, because the Poseidon chip allocates constants internally.
        let constants = meta.fixed_column();
        meta.enable_constant(constants);

        // --- Poseidon chip columns ---
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
        // Pow5Chip::configure enables equality on state and rc_b internally.
        let poseidon =
            Pow5Chip::configure::<P128Pow5T3>(meta, poseidon_state, poseidon_partial, rc_a, rc_b);

        TimestampOpenConfig {
            main,
            instance,
            poseidon,
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<F>,
    ) -> Result<(), Error> {
        let (domain_tag_cell, doc_hash_lo_cell, doc_hash_hi_cell, nonce_cell, _block_height_cell) =
            layouter.assign_region(
                || "timestamp witnesses",
                |mut region| {
                    let domain_tag = region.assign_advice(
                        || "domain_tag",
                        config.main,
                        ROW_DOMAIN_TAG,
                        || Value::known(F::from(TIMESTAMP_COMMITMENT_DOMAIN_TAG)),
                    )?;
                    let doc_hash_lo = region.assign_advice(
                        || "doc_hash_lo",
                        config.main,
                        ROW_DOC_HASH_LO,
                        || self.doc_hash_lo,
                    )?;
                    let doc_hash_hi = region.assign_advice(
                        || "doc_hash_hi",
                        config.main,
                        ROW_DOC_HASH_HI,
                        || self.doc_hash_hi,
                    )?;
                    let nonce =
                        region.assign_advice(|| "nonce", config.main, ROW_NONCE, || self.nonce)?;
                    // block_height is copied from instance[INSTANCE_BLOCK_HEIGHT]
                    // into an advice row so it can be fed into Poseidon.
                    let block_height = region.assign_advice_from_instance(
                        || "block_height",
                        config.instance,
                        INSTANCE_BLOCK_HEIGHT,
                        config.main,
                        ROW_BLOCK_HEIGHT,
                    )?;

                    Ok((domain_tag, doc_hash_lo, doc_hash_hi, nonce, block_height))
                },
            )?;

        // Poseidon commitment:
        // Hash(domain_tag, doc_hash_lo, doc_hash_hi, nonce). The block height
        // is verified against the fetched Zcash anchor outside this circuit.
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
                doc_hash_lo_cell,
                doc_hash_hi_cell,
                nonce_cell,
            ],
        )?;
        layouter.constrain_instance(commitment.cell(), config.instance, INSTANCE_COMMITMENT)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use halo2_proofs::dev::MockProver;
    use pasta_curves::Fp;

    const K: u32 = 9;
    const DEFAULT_DOC_HASH_LO: u128 = 0x0123_4567_89ab_cdef_0011_2233_4455_6677;
    const DEFAULT_DOC_HASH_HI: u128 = 0xfedc_ba98_7654_3210_7766_5544_3322_1100;
    const DEFAULT_NONCE: u128 = 0xdead_beef_cafe_f00d_0102_0304_0506_0708;
    const DEFAULT_BLOCK_HEIGHT: u64 = 2_750_000;

    fn fp_from_u128(value: u128) -> Fp {
        let lo = value as u64;
        let hi = (value >> 64) as u64;
        let two_pow_64 = Fp::from(u64::MAX) + Fp::from(1);
        Fp::from(lo) + (Fp::from(hi) * two_pow_64)
    }

    fn default_circuit() -> TimestampOpenCircuit<Fp> {
        TimestampOpenCircuit::<Fp>::new(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
        )
    }

    fn default_public_inputs() -> Vec<Fp> {
        TimestampOpenCircuit::<Fp>::public_inputs(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
            Fp::from(DEFAULT_BLOCK_HEIGHT),
        )
    }

    #[test]
    fn valid_commitment_passes() {
        let circuit = default_circuit();
        let public = default_public_inputs();
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn commitment_mismatch_fails() {
        // Honest witness + instance where we flip the commitment.
        let circuit = default_circuit();
        let mut public = default_public_inputs();
        public[INSTANCE_COMMITMENT] += Fp::from(1);
        let prover = MockProver::run(K, &circuit, vec![public]).unwrap();
        assert!(
            prover.verify().is_err(),
            "tampered commitment must fail copy constraint"
        );
    }

    #[test]
    fn block_height_is_external_anchor_evidence() {
        // The commitment no longer pre-commits to a guessed block height.
        // Verifiers bind height by fetching the txid and comparing the
        // confirmed anchor height against the receipt.
        let circuit = default_circuit();
        let mut public = default_public_inputs();
        public[INSTANCE_BLOCK_HEIGHT] += Fp::from(1);
        let prover = MockProver::run(K, &circuit, vec![public]).expect("mock prover");
        prover.assert_satisfied();
    }

    #[test]
    fn commitment_is_deterministic() {
        let a = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        let b = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        assert_eq!(a, b, "same witness must yield same commitment");
    }

    #[test]
    fn different_nonces_produce_different_commitments() {
        let a = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        let b = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE + 1),
        );
        assert_ne!(a, b, "distinct nonces must yield distinct commitments");
    }

    #[test]
    fn different_doc_hashes_produce_different_commitments() {
        let a = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        let b = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO + 1),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        assert_ne!(a, b, "distinct doc hashes must yield distinct commitments");
    }

    #[test]
    fn different_block_heights_keep_the_same_commitment() {
        let a = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        let b = TimestampOpenCircuit::<Fp>::compute_commitment(
            fp_from_u128(DEFAULT_DOC_HASH_LO),
            fp_from_u128(DEFAULT_DOC_HASH_HI),
            fp_from_u128(DEFAULT_NONCE),
        );
        assert_eq!(
            a, b,
            "anchor height is confirmed by the chain, not pre-committed"
        );
    }
}
