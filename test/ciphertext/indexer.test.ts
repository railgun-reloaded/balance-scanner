import { test } from 'brittle'

import type { IndexedCiphertextRecord } from '../../src/ciphertext'
import { CiphertextIndexer } from '../../src/ciphertext'

import { events } from './test-data'
import { eventGenerator } from './utils'

test('CiphertextIndexer: array ingestion, primary/secondary index', async (t) => {
  const indexer = new CiphertextIndexer(events, {
    indexConfig: {
      primary: 'commitmentHash',
      secondary: ['blindedSenderViewingKey', 'blindedReceiverViewingKey'],
    },
    fromBlock: 22865632,
    toBlock: 22865641,
  })
  await indexer.initialize()

  t.ok(indexer.exists('20750167656587297163013996512708175612769165796089350936909661845093401229266'))
  t.ok(indexer.exists('4334396287621752140794985571520419684742564655467396393269301406520235655169'))
  t.absent(indexer.exists('12'))

  const count = indexer.getCount()
  t.is(count, 2)

  const rec1 = indexer.get('20750167656587297163013996512708175612769165796089350936909661845093401229266')
  t.is(rec1?.transactionHash, '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492')

  const rec2 = indexer.get('4334396287621752140794985571520419684742564655467396393269301406520235655169')
  t.is(rec2?.transactionHash, '0xdc3f15f5caa3b303d74f8139543b4132b51e3dd2a2452b461f1ee81e711f684f')

  const bySender = indexer.getBy('blindedSenderViewingKey', '0x580a0778f95b9b41725ce72a0fc608c596285898abd49873aa46860896cd63f2')
  t.is(bySender.length, 1)
  t.is(bySender[0]?.transactionHash, '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492')

  const byReceiver = indexer.getBy('blindedReceiverViewingKey', '0xf72c79f26d8e50a47bef4d764c65366abfd86f9a3d0b55794511962ea15b83d4')
  t.is(byReceiver.length, 1)
  t.is(byReceiver[0]?.transactionHash, '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492')

  const byNonExistentIndex = indexer.getBy('transactionHash', '0xa2b5912c3341ad0cae31552fa77fb94fbb03a9deb846a5a4742e8bd90a500492')
  t.is(byNonExistentIndex.length, 0)

  const allPKs = [
    '20750167656587297163013996512708175612769165796089350936909661845093401229266',
    '4334396287621752140794985571520419684742564655467396393269301406520235655169',
  ]
  t.alike(indexer.getAllPrimaryKeys().sort(), allPKs.sort())

  indexer.setDecodeFunction((record: IndexedCiphertextRecord, key: string) => {
    return { decoded: true, key, hash: record.transactionHash }
  })
  const decoded = indexer.getDecoded('4334396287621752140794985571520419684742564655467396393269301406520235655169', '0xviewkey')
  t.alike(decoded, { decoded: true, key: '0xviewkey', hash: '0xdc3f15f5caa3b303d74f8139543b4132b51e3dd2a2452b461f1ee81e711f684f' })
})

test('CiphertextIndexer: async iterable ingestion', async (t) => {
  const indexer = new CiphertextIndexer(eventGenerator(events), {
    indexConfig: {
      primary: 'commitmentHash',
      secondary: ['blindedSenderViewingKey'],
    },
  })
  await indexer.initialize()

  t.ok(indexer.exists('20750167656587297163013996512708175612769165796089350936909661845093401229266'))
  t.ok(indexer.exists('4334396287621752140794985571520419684742564655467396393269301406520235655169'))
  t.absent(indexer.exists('12'))
})

test('CiphertextIndexer: composite primary key', async (t) => {
  /**
   * Composite primary key combining treeNumber and treePosition.
   * @param record - The indexed ciphertext record.
   * @returns A unique string key for the record.
   */
  const primaryKeyFn = (record: IndexedCiphertextRecord) => {
    return `${record.treeNumber}-${record.treePosition}`
  }

  const indexer = new CiphertextIndexer(events, {
    indexConfig: {
      primary: primaryKeyFn,
      secondary: ['blockNumber'],
    },
  })
  await indexer.initialize()

  const compositeKey = '1-41981'
  t.ok(indexer.exists(compositeKey))
  const rec = indexer.get(compositeKey)
  t.ok(rec)

  const byBlock = indexer.getBy('blockNumber', '22865632')
  t.ok(byBlock.length > 0)
})
