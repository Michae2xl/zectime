import type { ProductLocale } from "./types";

export type ZkTimestampClaimPhase = "mvp" | "phase-2";

export interface ZkTimestampClaim {
  id: "commit" | "full-reveal" | "predicate" | "batch";
  name: string;
  description: string;
  inputs: string;
  phase: ZkTimestampClaimPhase;
}

export interface ZkTimestampFlowStep {
  index: number;
  actor: string;
  action: string;
  detail: string;
}

export interface ZkTimestampStackBlock {
  label: string;
  value: string;
  note: string;
}

export interface ZkTimestampOutputItem {
  label: string;
  description: string;
}

export interface ZkTimestampArchitectureStep {
  label: string;
  title: string;
  body: string;
}

export type ZkTimestampOutputStageId =
  | "immediate"
  | "after-anchor"
  | "proof-later";

export interface ZkTimestampOutputStage {
  id: ZkTimestampOutputStageId;
  badge: string;
  title: string;
  description: string;
  items: readonly ZkTimestampOutputItem[];
}

export interface ZkTimestampCostItem {
  label: string;
  value: string;
  note: string;
}

export interface ZkTimestampComparisonRow {
  feature: string;
  zkTimestamp: string;
  openTimestamps: string;
  woleet: string;
}

export interface ZkTimestampCopy {
  shell: {
    brandLine: string;
    backToHub: string;
    rfcLinkLabel: string;
  };
  hero: {
    eyebrow: string;
    status: string;
    title: string;
    body: string;
    note: string;
    primaryCta: string;
    secondaryCta: string;
    stampCta: string;
    verifyCta: string;
    predicateCta: string;
  };
  service: {
    brand: string;
    title: string;
    body: string;
    generateTitle: string;
    generateBody: string;
    generateMeta: string;
    verifyTitle: string;
    verifyBody: string;
    verifyMeta: string;
    path: readonly string[];
  };
  architecture: {
    eyebrow: string;
    title: string;
    body: string;
    steps: readonly ZkTimestampArchitectureStep[];
  };
  claims: {
    eyebrow: string;
    title: string;
    body: string;
    phaseLabels: Record<ZkTimestampClaimPhase, string>;
    items: readonly ZkTimestampClaim[];
  };
  outputs: {
    eyebrow: string;
    title: string;
    body: string;
    stages: readonly ZkTimestampOutputStage[];
  };
  costs: {
    eyebrow: string;
    title: string;
    body: string;
    items: readonly ZkTimestampCostItem[];
  };
  comparison: {
    eyebrow: string;
    title: string;
    body: string;
    columnLabels: {
      feature: string;
      zkTimestamp: string;
      openTimestamps: string;
      woleet: string;
    };
    rows: readonly ZkTimestampComparisonRow[];
  };
  flow: {
    eyebrow: string;
    title: string;
    body: string;
    steps: readonly ZkTimestampFlowStep[];
  };
  stack: {
    eyebrow: string;
    title: string;
    body: string;
    blocks: readonly ZkTimestampStackBlock[];
  };
  stamp: ZkTimestampStampCopy;
  verify: ZkTimestampVerifyCopy;
  predicate: ZkTimestampPredicateCopy;
}

export interface ZkTimestampStampCopy {
  shell: {
    eyebrow: string;
    title: string;
    body: string;
    backLabel: string;
  };
  form: {
    fileLabel: string;
    chooseFileLabel: string;
    fileEmptyLabel: string;
    fileHint: string;
    blockHeightLabel: string;
    blockHeightHint: string;
    submitLabel: string;
    busyLabel: string;
  };
  progress: {
    eyebrow: string;
    title: string;
    elapsedLabel: string;
    etaLabel: string;
    etaValue: string;
    etaNote: string;
    steps: {
      hashing: ZkTimestampProgressStepCopy;
      anchoring: ZkTimestampProgressStepCopy;
      confirming: ZkTimestampProgressStepCopy;
      finalizing: ZkTimestampProgressStepCopy;
    };
  };
  errors: {
    missingFile: string;
    invalidBlockHeight: string;
    serverError: string;
    anchorError: string;
    missingAnchorConfig: string;
  };
  result: {
    eyebrow: string;
    successTitle: string;
    successBody: string;
    successStatus: string;
    commitmentLabel: string;
    blockHeightLabel: string;
    nonceLabel: string;
    docHashLabel: string;
    documentSizeLabel: string;
    downloadLabel: string;
    downloadPublicLabel: string;
    downloadPrivateLabel: string;
    nextStepsLabel: string;
    nextStepsBody: string;
    anchorCtaLabel: string;
    anchorBusyLabel: string;
    anchorSuccessTitle: string;
    anchorTxidLabel: string;
    anchorNetworkLabel: string;
    anchorCostLabel: string;
    anchorCostValue: string;
    anchorCostNote: string;
    anchorExplorerLabel: string;
    verifyCtaLabel: string;
  };
}

interface ZkTimestampProgressStepCopy {
  label: string;
  body: string;
}

export interface ZkTimestampVerifyCopy {
  shell: {
    eyebrow: string;
    title: string;
    body: string;
    backLabel: string;
  };
  form: {
    txidLabel: string;
    txidHint: string;
    receiptLabel: string;
    chooseReceiptLabel: string;
    receiptEmptyLabel: string;
    receiptFileHint: string;
    receiptHint: string;
    fileLabel: string;
    chooseFileLabel: string;
    fileEmptyLabel: string;
    fileHint: string;
    submitLabel: string;
    busyLabel: string;
  };
  errors: {
    missingTxid: string;
    invalidReceipt: string;
    serverError: string;
  };
  result: {
    eyebrow: string;
    matchTitle: string;
    mismatchTitle: string;
    noReceiptTitle: string;
    txidLabel: string;
    networkLabel: string;
    blockHeightLabel: string;
    commitmentLabel: string;
    receiptCommitmentLabel: string;
    receiptBlockHeightLabel: string;
    documentMatchTitle: string;
    documentMismatchTitle: string;
    documentHashLabel: string;
    documentSizeLabel: string;
  };
}

export interface ZkTimestampPredicateCopy {
  shell: {
    eyebrow: string;
    title: string;
    body: string;
    backLabel: string;
  };
  intro: {
    proveTitle: string;
    proveBody: string;
    verifyTitle: string;
    verifyBody: string;
  };
  prove: {
    witnessLabel: string;
    witnessHint: string;
    submitLabel: string;
    busyLabel: string;
    sampleLabel: string;
    errors: {
      missingWitness: string;
      invalidWitness: string;
      localOnly: string;
      serverError: string;
    };
    result: {
      eyebrow: string;
      title: string;
      proofLabel: string;
      proofHint: string;
      sizeLabel: string;
      commitmentLabel: string;
      blockHeightLabel: string;
      claimHashLabel: string;
      copyLabel: string;
      copiedLabel: string;
    };
  };
  verify: {
    proofLabel: string;
    proofHint: string;
    receiptLabel: string;
    receiptHint: string;
    submitLabel: string;
    busyLabel: string;
    errors: {
      missingProof: string;
      invalidReceipt: string;
      serverError: string;
    };
    result: {
      eyebrow: string;
      matchTitle: string;
      mismatchTitle: string;
      noReceiptTitle: string;
      commitmentLabel: string;
      blockHeightLabel: string;
      claimHashLabel: string;
      matchStatusLabel: string;
      matchLabel: string;
      mismatchLabel: string;
      noReceiptLabel: string;
    };
  };
}

const ZK_TIMESTAMP_COPY: Record<ProductLocale, ZkTimestampCopy> = {
  pt: {
    shell: {
      brandLine: "ZECTIME · ZK RECEIPTS",
      backToHub: "Voltar ao ecossistema",
      rfcLinkLabel: "Ler RFC completa",
    },
    hero: {
      eyebrow: "ZecTime · ZK-only timestamping",
      status: "Flow mainnet · zallet real",
      title: "Gere e verifique ZK receipts em Zcash.",
      body: "ZecTime transforma arquivo em commitment cego, ancora em memo Orchard e devolve um receipt verificável sem publicar o hash do documento.",
      note: "O produto é ZK-only: txid, altura e commitment são públicos; documento, hash e nonce ficam no private opening do holder.",
      primaryCta: "RFC técnica",
      secondaryCta: "Ver o que você recebe",
      stampCta: "Gerar ZK receipt",
      verifyCta: "Verificar receipt",
      predicateCta: "Provar predicate",
    },
    service: {
      brand: "ZecTime",
      title: "ZK timestamping para arquivos privados.",
      body: "Fingerprint privado do arquivo → commitment ZK cego → timestamp Zcash → receipt verificável.",
      generateTitle: "Generate ZK Receipt",
      generateBody:
        "Arquivo local, commitment cego, anchor Orchard e public receipt com txid.",
      generateMeta: "Generate proof",
      verifyTitle: "Verify ZK Receipt",
      verifyBody:
        "Cole o public receipt ou private opening; o arquivo original é checado no browser.",
      verifyMeta: "Verify proof",
      path: [
        "Private file fingerprint",
        "Blind ZK commitment",
        "Zcash timestamp",
        "Verifiable receipt",
      ],
    },
    architecture: {
      eyebrow: "Arquitetura",
      title: "O que acontece no sistema",
      body: "ZecTime segue o modelo direto de timestamping service: gerar receipt, guardar abertura privada, verificar depois. A diferença é que o hash público vira um commitment cego.",
      steps: [
        {
          label: "/timestamp",
          title: "Console com duas ações",
          body: "A primeira tela abre direto em Generate ZK Receipt e Verify ZK Receipt, sem fluxo lateral.",
        },
        {
          label: "Generate",
          title: "Receipt público + abertura privada",
          body: "O generate baixa um public receipt compartilhável e um private opening local com nonce/hash para o holder.",
        },
        {
          label: "Verify",
          title: "Receipt ou opening",
          body: "O verifier aceita public receipt, private opening ou bundle legado, extrai o txid quando existir e re-hasha o arquivo só no browser.",
        },
        {
          label: "API",
          title: "Chain-only backend",
          body: "`/api/timestamps/fetch` valida só txid + receipt público. Arquivo, nonce e hash nunca entram na API.",
        },
      ],
    },
    claims: {
      eyebrow: "Modos",
      title: "Quatro formas de usar o mesmo commitment",
      body: "Um único commitment publicado em memo Orchard cobre todos os casos. O holder escolhe depois como abrir, ou se abre.",
      phaseLabels: { mvp: "MVP", "phase-2": "Fase 2" },
      items: [
        {
          id: "commit",
          name: "Commit-only",
          description:
            "Publica o commitment Poseidon cego no memo Orchard. Ninguém vê nada, nem o hash. Prova existe silenciosamente, pronta para reveal futuro.",
          inputs:
            "Private: SHA-256 completo, nonce 128-bit. Public: commitment, block_height.",
          phase: "mvp",
        },
        {
          id: "full-reveal",
          name: "Full reveal",
          description:
            "Abre o commitment mostrando SHA-256 completo + nonce + altura. Qualquer um recomputa Poseidon e confere contra o memo on-chain.",
          inputs: "Reveal: SHA-256 completo, nonce, block_height.",
          phase: "mvp",
        },
        {
          id: "predicate",
          name: "Predicate reveal",
          description:
            "Prova uma propriedade do documento (assinado por PK, contém campo X) em Halo2 sem entregar o conteúdo. Commitment fica amarrado.",
          inputs:
            "Private: doc + claim path. Public: predicate_hash, commitment.",
          phase: "phase-2",
        },
        {
          id: "batch",
          name: "Batch stamping",
          description:
            "Um único commitment cobre N documentos via Merkle root. Útil para lotes de contratos, logs ou auditorias.",
          inputs:
            "Private: docs[], merkle_path. Public: merkle_root_commitment.",
          phase: "phase-2",
        },
      ],
    },
    flow: {
      eyebrow: "Como funciona",
      title: "O flow que importa",
      body: "Arquivo entra, ZK receipt sai, Zcash ancora, verifier confere. Sem vault, sem deadman switch, sem workflow jurídico pesado.",
      steps: [
        {
          index: 1,
          actor: "Holder",
          action: "Escolhe o arquivo",
          detail:
            "O produto pega só o material necessário para gerar o commitment. O documento não precisa ser publicado.",
        },
        {
          index: 2,
          actor: "ZecTime",
          action: "Gera ZK receipt",
          detail:
            "SHA-256 completo é dividido em duas metades de 128 bits; um nonce 128-bit blinda o commitment Poseidon.",
        },
        {
          index: 3,
          actor: "Zcash",
          action: "Ancora em memo Orchard",
          detail:
            "A transação carrega só o commitment. A altura do bloco vira o timestamp canônico.",
        },
        {
          index: 4,
          actor: "Verifier",
          action: "Confere txid + receipt",
          detail:
            "O verificador busca o memo on-chain e compara commitment + altura confirmada contra o receipt final.",
        },
      ],
    },
    stack: {
      eyebrow: "Stack",
      title: "Mesma base dos outros produtos ZK on Zcash",
      body: "Stack enxuto: SHA-256 local, Poseidon commitment, Halo2 proof e anchor Orchard. Nenhum trusted setup por documento.",
      blocks: [
        {
          label: "Proving system",
          value: "Halo2 + IPA",
          note: "pasta_curves, trustless. Poseidon é gate nativo: circuito TimestampOpenCircuit é leve.",
        },
        {
          label: "Hash interno",
          value: "Poseidon (pallas)",
          note: "Mesmo hash que Orchard usa. SHA-256 do documento fica off-circuit, cliente responsabiliza-se.",
        },
        {
          label: "Anchor on-chain",
          value: "Orchard memo (512B)",
          note: "Magic ZC + versão 0x02 + commitment 32B. A altura vem da confirmação da transação.",
        },
        {
          label: "Onde roda",
          value: "Web + CLI + zallet",
          note: "A rota web chama o binário zectime e usa o zallet configurado para publicar e confirmar o anchor.",
        },
      ],
    },
    outputs: {
      eyebrow: "O que você recebe",
      title: "Receipt público e abertura privada",
      body: "O produto publica, espera a confirmação e separa o que pode ser compartilhado do que deve ficar com o holder.",
      stages: [
        {
          id: "immediate",
          badge: "Local",
          title: "Commitment cego",
          description:
            "O arquivo vira SHA-256 local + nonce 128-bit + commitment Poseidon. O documento não entra no chain.",
          items: [
            {
              label: "public-receipt.json",
              description:
                "txid, network, commitment e block_height. Seguro para compartilhar com qualquer verifier.",
            },
            {
              label: "private-opening.json",
              description:
                "Nonce e SHA-256 completo ficam fora do servidor. Use só quando precisar provar o arquivo original.",
            },
          ],
        },
        {
          id: "after-anchor",
          badge: "Mainnet",
          title: "Transação Zcash confirmada",
          description:
            "O mesmo clique publica um self-spend shielded via zallet e busca o memo confirmado pelo txid.",
          items: [
            {
              label: "Txid Zcash",
              description:
                "Id da transação shielded que carrega o commitment no memo Orchard de 512 bytes.",
            },
            {
              label: "Memo Orchard",
              description:
                "Magic ZC + versão 0x02 + commitment 32B. A altura usada pelo verifier vem da confirmação da transação.",
            },
            {
              label: "Rede + explorer",
              description:
                "Link direto pro block explorer correto (regtest, testnet ou mainnet) pra verificação pública.",
            },
          ],
        },
        {
          id: "proof-later",
          badge: "Pra provar depois",
          title: "Você escolhe o que abre",
          description:
            "Quando alguém pedir prova, você decide quanto revela. O commitment continua amarrado no bloco Zcash.",
          items: [
            {
              label: "Full reveal",
              description:
                "Entrega doc_hash + nonce + altura. Verificador recomputa Poseidon e confere contra o memo on-chain.",
            },
            {
              label: "Predicate (T.7)",
              description:
                "Prova Halo2 de propriedade (assinado por PK X, contém campo Y) sem mostrar o conteúdo. Chega na próxima PR.",
            },
          ],
        },
      ],
    },
    costs: {
      eyebrow: "Custos por stamp (2026)",
      title: "ZIP-317 é o único custo",
      body: "Sem SaaS, sem trusted party, sem mensalidade. Só taxa de rede Zcash cobrada pela wallet do autor.",
      items: [
        {
          label: "Taxa on-chain (ZIP-317)",
          value: "0,0001 ZEC",
          note: "5000 zatoshis × max(logical_actions, 2). Cerca de R$ 0,01 a ZEC $20.",
        },
        {
          label: "Tempo de confirmação",
          value: "~75 segundos",
          note: "Um bloco Zcash. Probabilístico, não determinístico: espere 1–3 confirmações pra valor alto.",
        },
        {
          label: "Storage do documento",
          value: "R$ 0,00",
          note: "Documento fica com você. Memo 512B vive no chain histórico do Zcash.",
        },
        {
          label: "Trusted party",
          value: "Nenhuma",
          note: "Zero cerimônia de setup, zero CA, zero cartório. Só Zcash + Halo2.",
        },
      ],
    },
    comparison: {
      eyebrow: "ZecTime vs. alternativas",
      title: "Por que não é OpenTimestamps com outro chain",
      body: "A diferença não é trocar Bitcoin por Zcash. É nunca revelar o hash do documento.",
      columnLabels: {
        feature: "Critério",
        zkTimestamp: "ZecTime",
        openTimestamps: "OpenTimestamps",
        woleet: "Woleet",
      },
      rows: [
        {
          feature: "Commitment on-chain",
          zkTimestamp: "Poseidon(domain, SHA-256, nonce) cego",
          openTimestamps: "SHA-256(doc) público",
          woleet: "SHA-256 em Merkle root público",
        },
        {
          feature: "Privacidade do conteúdo",
          zkTimestamp: "Zero leak: commitment não revela o hash",
          openTimestamps: "Hash SHA-256 é público pra sempre",
          woleet: "Hash exposto via API Woleet",
        },
        {
          feature: "Anonimato do autor",
          zkTimestamp: "Shielded Orchard: sender e receiver ocultos",
          openTimestamps: "Bitcoin transparente: endereço vinculável",
          woleet: "Custodial: Woleet opera a wallet",
        },
        {
          feature: "Predicate proof",
          zkTimestamp: "Halo2: prova propriedade sem abrir o doc",
          openTimestamps: "Não suporta",
          woleet: "Não suporta",
        },
        {
          feature: "Trusted setup",
          zkTimestamp: "Nenhum (IPA, trustless)",
          openTimestamps: "Nenhum (SHA-256)",
          woleet: "Nenhum",
        },
        {
          feature: "Custo por stamp",
          zkTimestamp: "~R$ 0,01 (taxa ZEC)",
          openTimestamps: "Grátis (agregado via calendar)",
          woleet: "Pago (SaaS)",
        },
      ],
    },
    stamp: {
      shell: {
        eyebrow: "ZECTIME · GENERATE",
        title: "Generate ZK Receipt",
        body: "Selecione o documento. O browser gera o commitment, o servidor ancora só esse commitment via zallet e devolve txid + altura confirmada.",
        backLabel: "Voltar ao hub",
      },
      form: {
        fileLabel: "Documento",
        chooseFileLabel: "Escolher arquivo",
        fileEmptyLabel: "Nenhum arquivo selecionado",
        fileHint:
          "O arquivo fica no browser. Só o commitment cego é enviado ao servidor para anchor.",
        blockHeightLabel: "Altura de bloco",
        blockHeightHint:
          "Preenchida automaticamente pela confirmação do anchor.",
        submitLabel: "Gerar ZK receipt",
        busyLabel: "Processando on-chain...",
      },
      progress: {
        eyebrow: "Job de anchor",
        title: "Gerando receipt na Zcash",
        elapsedLabel: "Tempo",
        etaLabel: "Estimativa",
        etaValue: "2 a 5 min",
        etaNote:
          "Depende da inclusão do tx e das confirmações da mainnet Zcash.",
        steps: {
          hashing: {
            label: "Fingerprint privado",
            body: "O browser lê o arquivo localmente e cria o hash sem enviar o documento.",
          },
          anchoring: {
            label: "Commitment cego",
            body: "Só o commitment cego é enviado para publicação via zallet.",
          },
          confirming: {
            label: "Confirmação on-chain",
            body: "Aguardando a chain confirmar o memo Orchard que carrega o commitment.",
          },
          finalizing: {
            label: "Bundle final",
            body: "Montando o receipt kit com txid, rede, anchor, receipt público e opening local.",
          },
        },
      },
      errors: {
        missingFile: "Selecione um documento antes de enviar.",
        invalidBlockHeight: "Informe uma altura de bloco (inteiro >= 0).",
        serverError: "Falha ao gerar receipt: ",
        anchorError: "Falha ao ancorar no Zcash: ",
        missingAnchorConfig:
          "Anchor service não configurado. Defina ZECTIME_RPC_URL e ZECTIME_FROM_ADDRESS (ou ZALLET_RPC_URL/ZALLET_FROM_ADDRESS) antes de gerar um receipt final.",
      },
      result: {
        eyebrow: "Receipt pronto",
        successTitle: "Receipt final ancorado",
        successBody:
          "O commitment foi confirmado na Zcash. Baixe o receipt kit antes de fechar esta página.",
        successStatus: "Receipt kit pronto para download.",
        commitmentLabel: "Commitment",
        blockHeightLabel: "Altura de bloco",
        nonceLabel: "Nonce",
        docHashLabel: "Hash do documento (16B)",
        documentSizeLabel: "Tamanho enviado",
        downloadLabel: "Baixar ZK receipt",
        downloadPublicLabel: "Baixar receipt público",
        downloadPrivateLabel: "Baixar private opening",
        nextStepsLabel: "Próximos passos",
        nextStepsBody:
          "Compartilhe só o receipt público. Guarde o private opening com o documento; ele contém a abertura necessária para verificação local.",
        anchorCtaLabel: "Ancorar no Zcash",
        anchorBusyLabel: "Publicando memo Orchard...",
        anchorSuccessTitle: "Commitment ancorado on-chain",
        anchorTxidLabel: "Txid do anchor",
        anchorNetworkLabel: "Rede",
        anchorCostLabel: "Custo estimado",
        anchorCostValue: "0,0001 ZEC · ~R$ 0,01",
        anchorCostNote:
          "Taxa ZIP-317 cobrada pela sua wallet Zallet. Sem custo adicional do serviço.",
        anchorExplorerLabel: "Ver no explorer",
        verifyCtaLabel: "Verificar receipt",
      },
    },
    verify: {
      shell: {
        eyebrow: "ZECTIME · VERIFY",
        title: "Verify ZK Receipt",
        body: "Cole o receipt público ou o private opening. O servidor busca só a chain; arquivo e abertura são conferidos no browser.",
        backLabel: "Voltar ao hub",
      },
      form: {
        txidLabel: "Txid do anchor",
        txidHint: "32 bytes em hex (opcional se o bundle tiver txid).",
        receiptLabel: "ZK Receipt JSON",
        chooseReceiptLabel: "Carregar receipt",
        receiptEmptyLabel: "Nenhum receipt selecionado",
        receiptFileHint:
          "Use o zectime-zk-receipt.json baixado no Generate. O txid será lido do bundle quando existir.",
        receiptHint:
          "Ou cole o conteúdo JSON do receipt público, private opening ou bundle legado.",
        fileLabel: "Documento original (opcional)",
        chooseFileLabel: "Escolher arquivo",
        fileEmptyLabel: "Nenhum arquivo selecionado",
        fileHint:
          "Quando enviado, o browser re-hasha localmente. O backend não recebe o arquivo.",
        submitLabel: "Verificar ZK receipt",
        busyLabel: "Buscando memo Orchard e verificando localmente...",
      },
      errors: {
        missingTxid: "Informe um txid válido (64 hex chars).",
        invalidReceipt: "Receipt JSON inválido. Confira a colagem.",
        serverError: "Falha na consulta: ",
      },
      result: {
        eyebrow: "Resultado",
        matchTitle: "Commitment on-chain confere com o receipt.",
        mismatchTitle: "Divergência entre receipt e anchor on-chain.",
        noReceiptTitle: "Memo Orchard encontrado (sem receipt para comparar).",
        txidLabel: "Txid",
        networkLabel: "Rede",
        blockHeightLabel: "Altura on-chain",
        commitmentLabel: "Commitment on-chain",
        receiptCommitmentLabel: "Commitment do receipt",
        receiptBlockHeightLabel: "Altura do receipt",
        documentMatchTitle: "Arquivo confere localmente com o private opening.",
        documentMismatchTitle: "Arquivo não bate com o private opening.",
        documentHashLabel: "Hash local do arquivo (16B)",
        documentSizeLabel: "Tamanho verificado",
      },
    },
    predicate: {
      shell: {
        eyebrow: "ZK ON ZCASH · TIMESTAMP · PREDICATE",
        title: "Prove uma propriedade do documento, sem revelar o documento",
        body: "O holder gera uma prova Halo2 (k=10) amarrando o commitment do receipt a um campo específico do documento via Merkle-Poseidon depth-8. Verifiers só aprendem claim_hash + commitment + block_height.",
        backLabel: "Voltar ao hub",
      },
      intro: {
        proveTitle: "1. Gerar prova (holder)",
        proveBody:
          "A prova usa witness privado e deve rodar localmente via CLI/WASM. A UI web não envia witness ao servidor.",
        verifyTitle: "2. Verificar prova (verifier)",
        verifyBody:
          "Cole o proof base64 e opcionalmente o receipt JSON. O servidor roda zectime timestamp predicate-verify e confere commitment + block_height contra o receipt se informado.",
      },
      prove: {
        witnessLabel: "Witness JSON",
        witnessHint:
          "Objeto com doc_root, nonce, field_value em hex 0x; block_height e field_index numéricos; path_bits e siblings com exatamente 8 entradas.",
        submitLabel: "Gerar predicate proof",
        busyLabel: "Provando Halo2 k=10...",
        sampleLabel: "Preencher com exemplo",
        errors: {
          missingWitness: "Cole o witness JSON.",
          invalidWitness: "Witness JSON inválido. Confira o formato.",
          localOnly:
            "Predicate proving é local-only para privacidade. Use o zectime CLI ou um cliente WASM; a API web não aceita witness JSON.",
          serverError: "Falha ao gerar prova: ",
        },
        result: {
          eyebrow: "Prova gerada",
          title: "Predicate proof pronto",
          proofLabel: "Proof (base64)",
          proofHint: "Use o mesmo proof no passo 2 para verificar localmente.",
          sizeLabel: "Tamanho do proof",
          commitmentLabel: "Commitment",
          blockHeightLabel: "Block height",
          claimHashLabel: "Claim hash",
          copyLabel: "Copiar",
          copiedLabel: "Copiado",
        },
      },
      verify: {
        proofLabel: "Proof (base64)",
        proofHint:
          "Cole o proof base64 gerado pelo passo 1 (ou recebido do holder).",
        receiptLabel: "Receipt JSON (opcional)",
        receiptHint:
          "Cole o receipt do stamp se quiser cross-check de commitment + block_height.",
        submitLabel: "Verificar proof",
        busyLabel: "Verificando Halo2...",
        errors: {
          missingProof: "Cole o proof em base64.",
          invalidReceipt: "Receipt JSON inválido. Confira a colagem.",
          serverError: "Falha na verificação: ",
        },
        result: {
          eyebrow: "Resultado",
          matchTitle: "Proof válido e bate com o receipt.",
          mismatchTitle: "Proof válido, mas diverge do receipt.",
          noReceiptTitle: "Proof válido (sem receipt para comparar).",
          commitmentLabel: "Commitment",
          blockHeightLabel: "Block height",
          claimHashLabel: "Claim hash",
          matchStatusLabel: "Cross-check com receipt",
          matchLabel: "Confere",
          mismatchLabel: "Diverge",
          noReceiptLabel: "Receipt não enviado",
        },
      },
    },
  },
  en: {
    shell: {
      brandLine: "ZECTIME · ZK RECEIPTS",
      backToHub: "Back to ecosystem",
      rfcLinkLabel: "Read the full RFC",
    },
    hero: {
      eyebrow: "ZecTime · ZK-only timestamping",
      status: "Mainnet flow · real zallet",
      title: "Generate and verify ZK receipts on Zcash.",
      body: "ZecTime turns a file into a blind commitment, anchors it in an Orchard memo, and returns a verifiable receipt without publishing the document hash.",
      note: "The product is ZK-only: txid, height, and commitment are public; the document, hash, and nonce stay in the holder's private opening.",
      primaryCta: "Technical RFC",
      secondaryCta: "See what you receive",
      stampCta: "Generate ZK receipt",
      verifyCta: "Verify receipt",
      predicateCta: "Prove predicate",
    },
    service: {
      brand: "ZecTime",
      title: "ZK timestamping for private files.",
      body: "Private file fingerprint → Blind ZK commitment → Zcash timestamp → Verifiable receipt.",
      generateTitle: "Generate ZK Receipt",
      generateBody:
        "Local file, blind commitment, Orchard anchor, and public receipt with txid.",
      generateMeta: "Generate proof",
      verifyTitle: "Verify ZK Receipt",
      verifyBody:
        "Paste the public receipt or private opening; the original file is checked in the browser.",
      verifyMeta: "Verify proof",
      path: [
        "Private file fingerprint",
        "Blind ZK commitment",
        "Zcash timestamp",
        "Verifiable receipt",
      ],
    },
    architecture: {
      eyebrow: "Architecture",
      title: "What the system does",
      body: "ZecTime follows the direct timestamping-service model: generate a receipt, keep the private opening, verify later. The difference is that the public hash becomes a blind commitment.",
      steps: [
        {
          label: "/timestamp",
          title: "Two-action console",
          body: "The first screen opens directly with Generate ZK Receipt and Verify ZK Receipt, with no deck or side workflow.",
        },
        {
          label: "Generate",
          title: "Public receipt + private opening",
          body: "Generate downloads a shareable public receipt and a local private opening with nonce/hash for the holder.",
        },
        {
          label: "Verify",
          title: "Receipt or opening",
          body: "The verifier accepts a public receipt, private opening, or legacy bundle, extracts txid when present, and re-hashes the file only in the browser.",
        },
        {
          label: "API",
          title: "Chain-only backend",
          body: "`/api/timestamps/fetch` validates only txid + public receipt. File, nonce, and hash never enter the API.",
        },
      ],
    },
    claims: {
      eyebrow: "Modes",
      title: "Four ways to use the same commitment",
      body: "One commitment in an Orchard memo covers every case. The holder decides later how to open it, or whether to open it at all.",
      phaseLabels: { mvp: "MVP", "phase-2": "Phase 2" },
      items: [
        {
          id: "commit",
          name: "Commit-only",
          description:
            "Publishes the blind Poseidon commitment in the Orchard memo. No one sees anything, not even the hash. Proof exists silently, ready for future reveal.",
          inputs:
            "Private: full SHA-256, 128-bit nonce. Public: commitment, block_height.",
          phase: "mvp",
        },
        {
          id: "full-reveal",
          name: "Full reveal",
          description:
            "Opens the commitment by showing full SHA-256 + nonce + height. Anyone recomputes Poseidon and checks it against the on-chain memo.",
          inputs: "Reveal: full SHA-256, nonce, block_height.",
          phase: "mvp",
        },
        {
          id: "predicate",
          name: "Predicate reveal",
          description:
            "Proves a property of the document (signed by PK, contains field X) in Halo2 without disclosing the content. Commitment stays bound.",
          inputs:
            "Private: doc + claim path. Public: predicate_hash, commitment.",
          phase: "phase-2",
        },
        {
          id: "batch",
          name: "Batch stamping",
          description:
            "A single commitment covers N documents via Merkle root. Useful for batches of contracts, logs, or audits.",
          inputs:
            "Private: docs[], merkle_path. Public: merkle_root_commitment.",
          phase: "phase-2",
        },
      ],
    },
    flow: {
      eyebrow: "How it works",
      title: "The product flow that matters",
      body: "File in, ZK receipt out, Zcash anchors it, verifier checks it. No vault, no deadman switch, no heavy legal workflow.",
      steps: [
        {
          index: 1,
          actor: "Holder",
          action: "Choose the file",
          detail:
            "The product takes only what is needed to produce the commitment. The document is never published.",
        },
        {
          index: 2,
          actor: "ZecTime",
          action: "Generate a ZK receipt",
          detail:
            "The full SHA-256 digest is split into two 128-bit halves; a 128-bit nonce blinds the Poseidon commitment.",
        },
        {
          index: 3,
          actor: "Zcash",
          action: "Anchor in an Orchard memo",
          detail:
            "The transaction carries only the commitment. The block height becomes the canonical timestamp.",
        },
        {
          index: 4,
          actor: "Verifier",
          action: "Check txid + receipt",
          detail:
            "The verifier fetches the on-chain memo and compares commitment + confirmed height against the final receipt.",
        },
      ],
    },
    stack: {
      eyebrow: "Stack",
      title: "Same base as the other ZK on Zcash products",
      body: "Full reuse with ZecTime: same zectime binary, same pasta_curves primitives, same Orchard anchor. No trusted setup.",
      blocks: [
        {
          label: "Proving system",
          value: "Halo2 + IPA",
          note: "pasta_curves, trustless. Poseidon is a native gate: TimestampOpenCircuit stays light.",
        },
        {
          label: "Inner hash",
          value: "Poseidon (pallas)",
          note: "Same hash Orchard uses. SHA-256 of the document stays off-circuit: client owns integrity.",
        },
        {
          label: "On-chain anchor",
          value: "Orchard memo (512B)",
          note: "ZC magic + version 0x02 + 32B commitment. Height comes from transaction confirmation.",
        },
        {
          label: "Where it runs",
          value: "Web + CLI + zallet",
          note: "The web route calls the zectime binary and uses the configured zallet to publish and confirm the anchor.",
        },
      ],
    },
    outputs: {
      eyebrow: "What you receive",
      title: "Public receipt and private opening",
      body: "The product publishes, waits for confirmation, and separates what can be shared from what must stay with the holder.",
      stages: [
        {
          id: "immediate",
          badge: "Local",
          title: "Blind commitment",
          description:
            "The file becomes a local SHA-256 digest + 128-bit nonce + Poseidon commitment. The document itself never goes on-chain.",
          items: [
            {
              label: "public-receipt.json",
              description:
                "txid, network, commitment, and block_height. Safe to share with any verifier.",
            },
            {
              label: "private-opening.json",
              description:
                "Nonce and full SHA-256 stay off-server. Use it only when you need to prove the original file.",
            },
          ],
        },
        {
          id: "after-anchor",
          badge: "Mainnet",
          title: "Zcash transaction confirmed",
          description:
            "The same click publishes a shielded self-spend via zallet and fetches the confirmed memo by txid.",
          items: [
            {
              label: "Zcash txid",
              description:
                "Id of the shielded transaction that carries the commitment in the 512-byte Orchard memo.",
            },
            {
              label: "Orchard memo",
              description:
                "ZC magic + version 0x02 + 32B commitment. The verifier uses the confirmed transaction height.",
            },
            {
              label: "Network + explorer",
              description:
                "Direct link to the correct block explorer (regtest, testnet, or mainnet) for public verification.",
            },
          ],
        },
        {
          id: "proof-later",
          badge: "To prove later",
          title: "You decide what to open",
          description:
            "When someone asks for proof, you pick how much to reveal. The commitment stays bound to the Zcash block either way.",
          items: [
            {
              label: "Full reveal",
              description:
                "Hand out doc_hash + nonce + height. Verifier recomputes Poseidon and checks it against the on-chain memo.",
            },
            {
              label: "Predicate (T.7)",
              description:
                "Halo2 proof of a property (signed by PK X, contains field Y) without disclosing the content. Ships in the next PR.",
            },
          ],
        },
      ],
    },
    costs: {
      eyebrow: "Cost per stamp (2026)",
      title: "ZIP-317 is the only cost",
      body: "No SaaS, no trusted party, no subscription. Just the Zcash network fee paid by the author's wallet.",
      items: [
        {
          label: "On-chain fee (ZIP-317)",
          value: "0.0001 ZEC",
          note: "5000 zatoshis × max(logical_actions, 2). About US$ 0.003 at ZEC $30.",
        },
        {
          label: "Confirmation time",
          value: "~75 seconds",
          note: "One Zcash block. Probabilistic, not final: wait for 1–3 confirmations on high-value stamps.",
        },
        {
          label: "Document storage",
          value: "US$ 0.00",
          note: "The document stays with you. The 512B memo lives in the historical Zcash chain.",
        },
        {
          label: "Trusted party",
          value: "None",
          note: "No ceremony setup, no CA, no notary. Just Zcash + Halo2.",
        },
      ],
    },
    comparison: {
      eyebrow: "ZecTime vs. alternatives",
      title: "Why this is not OpenTimestamps on another chain",
      body: "The difference is not swapping Bitcoin for Zcash. It is never revealing the document hash.",
      columnLabels: {
        feature: "Criterion",
        zkTimestamp: "ZecTime",
        openTimestamps: "OpenTimestamps",
        woleet: "Woleet",
      },
      rows: [
        {
          feature: "On-chain commitment",
          zkTimestamp: "Blind Poseidon(domain, SHA-256, nonce)",
          openTimestamps: "Public SHA-256(doc)",
          woleet: "Public SHA-256 in a Merkle root",
        },
        {
          feature: "Content privacy",
          zkTimestamp: "Zero leak: commitment does not reveal the hash",
          openTimestamps: "SHA-256 hash is public forever",
          woleet: "Hash exposed via the Woleet API",
        },
        {
          feature: "Author anonymity",
          zkTimestamp: "Shielded Orchard: sender and receiver hidden",
          openTimestamps: "Transparent Bitcoin: address is linkable",
          woleet: "Custodial: Woleet owns the wallet",
        },
        {
          feature: "Predicate proof",
          zkTimestamp: "Halo2: prove a property without opening the doc",
          openTimestamps: "Not supported",
          woleet: "Not supported",
        },
        {
          feature: "Trusted setup",
          zkTimestamp: "None (IPA, trustless)",
          openTimestamps: "None (SHA-256)",
          woleet: "None",
        },
        {
          feature: "Cost per stamp",
          zkTimestamp: "~US$ 0.003 (ZEC fee)",
          openTimestamps: "Free (aggregated via calendar)",
          woleet: "Paid (SaaS)",
        },
      ],
    },
    stamp: {
      shell: {
        eyebrow: "ZECTIME · GENERATE",
        title: "Generate ZK Receipt",
        body: "Select the document. The browser generates the commitment, the server anchors only that commitment via zallet, and returns txid + confirmed height.",
        backLabel: "Back to hub",
      },
      form: {
        fileLabel: "Document",
        chooseFileLabel: "Choose file",
        fileEmptyLabel: "No file selected",
        fileHint:
          "The file stays in the browser. Only the blind commitment is sent to the server for anchoring.",
        blockHeightLabel: "Block height",
        blockHeightHint:
          "Filled automatically from the confirmed anchor.",
        submitLabel: "Generate ZK receipt",
        busyLabel: "Working on-chain...",
      },
      progress: {
        eyebrow: "Anchor job",
        title: "Generating receipt on Zcash",
        elapsedLabel: "Elapsed",
        etaLabel: "Estimated time",
        etaValue: "2 to 5 min",
        etaNote:
          "Timing depends on transaction inclusion and Zcash mainnet confirmations.",
        steps: {
          hashing: {
            label: "Private fingerprint",
            body: "The browser reads the file locally and hashes it without uploading the document.",
          },
          anchoring: {
            label: "Blind commitment",
            body: "Only the blind commitment is sent for zallet publication.",
          },
          confirming: {
            label: "On-chain confirmation",
            body: "Waiting for the Orchard memo carrying the commitment to confirm.",
          },
          finalizing: {
            label: "Final bundle",
            body: "Building the receipt kit with txid, network, anchor, public receipt, and local opening.",
          },
        },
      },
      errors: {
        missingFile: "Pick a document before submitting.",
        invalidBlockHeight: "Block height must be a non-negative integer.",
        serverError: "Receipt generation failed: ",
        anchorError: "Anchor on Zcash failed: ",
        missingAnchorConfig:
          "Anchor service is not configured. Set ZECTIME_RPC_URL and ZECTIME_FROM_ADDRESS (or ZALLET_RPC_URL/ZALLET_FROM_ADDRESS) before generating a final receipt.",
      },
      result: {
        eyebrow: "Receipt ready",
        successTitle: "Final receipt anchored",
        successBody:
          "The commitment is confirmed on Zcash. Download the receipt kit before closing this page.",
        successStatus: "Receipt kit ready for download.",
        commitmentLabel: "Commitment",
        blockHeightLabel: "Block height",
        nonceLabel: "Nonce",
        docHashLabel: "Document hash (16B)",
        documentSizeLabel: "Uploaded size",
        downloadLabel: "Download ZK receipt",
        downloadPublicLabel: "Download public receipt",
        downloadPrivateLabel: "Download private opening",
        nextStepsLabel: "Next steps",
        nextStepsBody:
          "Share only the public receipt. Keep the private opening with the document; it contains the local verification opening.",
        anchorCtaLabel: "Anchor on Zcash",
        anchorBusyLabel: "Publishing Orchard memo...",
        anchorSuccessTitle: "Commitment anchored on-chain",
        anchorTxidLabel: "Anchor txid",
        anchorNetworkLabel: "Network",
        anchorCostLabel: "Estimated cost",
        anchorCostValue: "0.0001 ZEC · ~US$ 0.003",
        anchorCostNote:
          "ZIP-317 fee paid by your Zallet wallet. No additional service fee.",
        anchorExplorerLabel: "View on explorer",
        verifyCtaLabel: "Verify receipt",
      },
    },
    verify: {
      shell: {
        eyebrow: "ZECTIME · VERIFY",
        title: "Verify ZK Receipt",
        body: "Paste the public receipt or private opening. The server fetches only the chain; file and opening checks stay in the browser.",
        backLabel: "Back to hub",
      },
      form: {
        txidLabel: "Anchor txid",
        txidHint: "32-byte hex (optional when the bundle includes txid).",
        receiptLabel: "ZK Receipt JSON",
        chooseReceiptLabel: "Load receipt",
        receiptEmptyLabel: "No receipt selected",
        receiptFileHint:
          "Use the zectime-zk-receipt.json downloaded from Generate. The txid is read from the bundle when present.",
        receiptHint:
          "Or paste the JSON content of the public receipt, private opening, or legacy bundle.",
        fileLabel: "Original document (optional)",
        chooseFileLabel: "Choose file",
        fileEmptyLabel: "No file selected",
        fileHint:
          "When provided, the browser re-hashes locally. The backend never receives the file.",
        submitLabel: "Verify ZK receipt",
        busyLabel: "Fetching Orchard memo and checking locally...",
      },
      errors: {
        missingTxid: "Provide a valid txid (64 hex chars).",
        invalidReceipt: "Invalid receipt JSON. Check what you pasted.",
        serverError: "Lookup failed: ",
      },
      result: {
        eyebrow: "Result",
        matchTitle: "On-chain commitment matches the receipt.",
        mismatchTitle: "Receipt and on-chain anchor diverge.",
        noReceiptTitle: "Orchard memo found (no receipt to compare).",
        txidLabel: "Txid",
        networkLabel: "Network",
        blockHeightLabel: "On-chain height",
        commitmentLabel: "On-chain commitment",
        receiptCommitmentLabel: "Receipt commitment",
        receiptBlockHeightLabel: "Receipt height",
        documentMatchTitle: "File locally matches the private opening.",
        documentMismatchTitle: "File does not match the private opening.",
        documentHashLabel: "Local file hash (16B)",
        documentSizeLabel: "Verified size",
      },
    },
    predicate: {
      shell: {
        eyebrow: "ZK ON ZCASH · TIMESTAMP · PREDICATE",
        title:
          "Prove a property of the document without revealing the document",
        body: "The holder generates a Halo2 proof (k=10) binding the receipt commitment to a specific field via a Merkle-Poseidon depth-8 path. Verifiers only learn claim_hash + commitment + block_height.",
        backLabel: "Back to hub",
      },
      intro: {
        proveTitle: "1. Generate proof (holder)",
        proveBody:
          "The proof uses private witness data and must run locally through CLI/WASM. The web UI does not send witness data to the server.",
        verifyTitle: "2. Verify proof (verifier)",
        verifyBody:
          "Paste the base64 proof and, optionally, the receipt JSON. The server runs zectime timestamp predicate-verify and cross-checks commitment + block_height against the receipt if provided.",
      },
      prove: {
        witnessLabel: "Witness JSON",
        witnessHint:
          "Object with doc_root, nonce, field_value as 0x-prefixed hex; block_height and field_index as numbers; path_bits and siblings with exactly 8 entries.",
        submitLabel: "Generate predicate proof",
        busyLabel: "Proving Halo2 k=10...",
        sampleLabel: "Fill with sample",
        errors: {
          missingWitness: "Paste the witness JSON.",
          invalidWitness: "Invalid witness JSON. Check the format.",
          localOnly:
            "Predicate proving is local-only for privacy. Use the zectime CLI or a WASM client; the web API does not accept witness JSON.",
          serverError: "Failed to generate proof: ",
        },
        result: {
          eyebrow: "Proof generated",
          title: "Predicate proof ready",
          proofLabel: "Proof (base64)",
          proofHint: "Use this proof in step 2 to verify locally.",
          sizeLabel: "Proof size",
          commitmentLabel: "Commitment",
          blockHeightLabel: "Block height",
          claimHashLabel: "Claim hash",
          copyLabel: "Copy",
          copiedLabel: "Copied",
        },
      },
      verify: {
        proofLabel: "Proof (base64)",
        proofHint:
          "Paste the base64 proof generated in step 1 (or received from the holder).",
        receiptLabel: "Receipt JSON (optional)",
        receiptHint:
          "Paste the stamp receipt if you want to cross-check commitment + block_height.",
        submitLabel: "Verify proof",
        busyLabel: "Verifying Halo2...",
        errors: {
          missingProof: "Paste the base64 proof.",
          invalidReceipt: "Invalid receipt JSON. Check what you pasted.",
          serverError: "Verification failed: ",
        },
        result: {
          eyebrow: "Result",
          matchTitle: "Proof valid and matches the receipt.",
          mismatchTitle: "Proof valid but diverges from the receipt.",
          noReceiptTitle: "Proof valid (no receipt to compare).",
          commitmentLabel: "Commitment",
          blockHeightLabel: "Block height",
          claimHashLabel: "Claim hash",
          matchStatusLabel: "Receipt cross-check",
          matchLabel: "Matches",
          mismatchLabel: "Diverges",
          noReceiptLabel: "No receipt provided",
        },
      },
    },
  },
};

export function getZkTimestampCopy(locale: ProductLocale): ZkTimestampCopy {
  return ZK_TIMESTAMP_COPY[locale];
}

export const ZK_TIMESTAMP_RFC_PATH = "/docs/ARCHITECTURE.md";
