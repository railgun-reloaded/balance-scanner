import type { CommitmentEvent } from '../../src/ciphertext'

const events = [{
  name: 'Transact',
  blockNumber: 22865632,
  transactionIndex: 41981,
  transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
  logIndex: 41981,
  args: {
    id: '0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a3fd',
    treeNumber: 1,
    batchStartTreePosition: 41981,
    treePosition: 41981,
    blockNumber: '22865632',
    transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
    blockTimestamp: '1751870927',
    commitmentType: 'TransactCommitment',
    hash: '20750167656587297163013996512708175612769165796089350936909661845093401229266',
    ciphertext: {
      ciphertext: {
        iv: '0x7dbeacdaa283f07ae6ee33591f2a40b7',
        tag: '0x77d49bc9ba2fb19042932a066ed6ed49',
        data: [
          '0xdc4b418632f33898656b73bddbe2f9793a5065caace41d75e70409a71b93e64c',
          '0xa509496908f816b6263983c3ad32a76ec42c7ac3813df4969ca86fe94bd9e18b',
          '0xe1356b1b9b1b4361d956d5ca3f02e73e1cccef78e20aa9497c150988cfb8537f'
        ]
      },
      blindedSenderViewingKey: '0x580a0778f95b9b41725ce72a0fc608c596285898abd49873aa46860896cd63f2',
      blindedReceiverViewingKey: '0xf72c79f26d8e50a47bef4d764c65366abfd86f9a3d0b55794511962ea15b83d4',
      annotationData: '0xea3ae7b13bafd3d5a51f6bb61d10fb919656be6735b7d80856300b1c82e91fc4c1aa39659129b3e482bb70d4c8b8dc98911305e565929ac96a9a05b39921',
      memo: '0x'
    },
    name: 'TransactCommitment',
    startPosition: 41981
  }
},
{
  name: 'Unshield',
  blockNumber: 22865632,
  transactionIndex: 3925868544,
  transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
  logIndex: 3925868544,
  args: {
    id: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492ea000000',
    blockNumber: '22865632',
    to: '0x4025ee6512dbbda97049bcf5aa5d38c54af6be8a',
    transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
    fee: '3756458716151889',
    blockTimestamp: '1751870927',
    amount: '1498827027744604056',
    eventLogIndex: '234',
    token: {
      id: '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      tokenType: 'ERC20',
      tokenSubID: '0x00',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    },
    name: 'unshields',
    treeNumber: 7.359548273406993e+76,
    startPosition: 3925868544
  }
},
{
  name: 'Nullifiers',
  blockNumber: 22865632,
  transactionIndex: 1.2038975343131941e+76,
  transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
  logIndex: 1.2038975343131941e+76,
  args: {
    id: '0x00000000000000000000000000000000000000000000000000000000000000011a9dd18de83dbcd9e53b70893f82ae7709f587e1c3eb0bbaccc9fe79fb1dccb7',
    blockNumber: '22865632',
    nullifier: '0x1a9dd18de83dbcd9e53b70893f82ae7709f587e1c3eb0bbaccc9fe79fb1dccb7',
    transactionHash: '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492',
    blockTimestamp: '1751870927',
    treeNumber: 1,
    name: 'nullifiers',
    startPosition: 1.2038975343131941e+76
  }
},
{
  name: 'Shield',
  blockNumber: 22865641,
  transactionIndex: 41982,
  transactionHash: '0xdc3f15f5caa3b303d74f8139543b4132b51e3dd2a2452b461f1ee81e711f684f',
  logIndex: 41982,
  args: {
    id: '0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a3fe',
    treeNumber: 1,
    batchStartTreePosition: 41982,
    treePosition: 41982,
    blockNumber: '22865641',
    transactionHash: '0xdc3f15f5caa3b303d74f8139543b4132b51e3dd2a2452b461f1ee81e711f684f',
    blockTimestamp: '1751871035',
    commitmentType: 'ShieldCommitment',
    hash: '4334396287621752140794985571520419684742564655467396393269301406520235655169',
    shieldKey: '0xb77d9e7185a5a1ff862f4fd2b26aa2ebb690079ec85891ad79395d25bd75885f',
    fee: '57500000',
    encryptedBundle: [
      '0x69623ad1dcde9181446f3bcdb53eb790c75cb5206942291a1ea17768455dc10c',
      '0xfc98bf57e30bd69de3854c18d1eaaaba394cf3c92fe78901639ca5088e570c13',
      '0xd2ffb009a93c5733ec7c77c927a69f831360981089be90327febeefe49ee927e'
    ],
    preimage: {
      npk: '0x269ad16643d451a77fc60fbaf2a0392d6243271a1ec8c70c5ca0dd40d70e7a2d',
      value: '22942500000',
      token: {
        id: '0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        tokenType: 'ERC20',
        tokenSubID: '0x00',
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
      }
    },
    name: 'ShieldCommitment',
    startPosition: 41982
  }
}] as CommitmentEvent[]

export { events }
